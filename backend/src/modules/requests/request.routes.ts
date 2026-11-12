import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireSession, requireCsrf } from "../auth/auth-middleware.js";
import { requireTenant, requirePermission, requireAnyPermission } from "../tenancy/tenant-context.js";

export const requestRouter = Router();
requestRouter.use(requireSession, requireTenant);

const itemSchema = z.object({
  itemType: z.enum(["ASSET","SOFTWARE","SERVICE"]),
  description: z.string().trim().min(5).max(500),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().trim().max(2000).optional(),
}).strict();
const createSchema = z.object({
  requestType: z.enum(["ASSET","SOFTWARE","SERVICE"]),
  businessReason: z.string().trim().min(8).max(2000),
  items: z.array(itemSchema).min(1).max(30),
}).strict();
const decisionSchema = z.object({
  decision: z.enum(["APPROVED","REJECTED","CHANGES_REQUESTED"]),
  reason: z.string().trim().min(8).max(2000),
}).strict();

const include = {
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  items: { select: { id:true, itemType:true, description:true,
    quantity:true, approvedQuantity:true, notes:true } },
} as const;
const hasApprove = (keys: readonly string[]) => keys.includes("request.approve");
function sendError(response: import("express").Response, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}

requestRouter.get("/", requireAnyPermission(["request.create","request.approve"]),
  async (request,response,next)=>{
    try {
      const auth=request.auth!;
      const canApprove=hasApprove(auth.permissions??[]);
      const status=typeof request.query.status==="string" ? request.query.status : "";
      const allowed=["PENDING","APPROVED","REJECTED","CHANGES_REQUESTED",
        "CANCELLED","PARTIALLY_APPROVED","FULFILLMENT_IN_PROGRESS","FULFILLED"];
      if(status && !allowed.includes(status)) {
        sendError(response,400,"VALIDATION_ERROR","Invalid request status.");return;
      }
      const data=await prisma.assetRequest.findMany({
        where:{
          tenantId:auth.tenantId!,
          ...(!canApprove ? {requestedById:auth.userId} : {}),
          ...(status ? {status:status as "PENDING"} : {}),
        },
        include,orderBy:[{createdAt:"desc"}],take:100,
      });
      response.json({data,canApprove});
    }catch(error){next(error);}
  });

requestRouter.get("/:id", requireAnyPermission(["request.create","request.approve"]),
  async(request,response,next)=>{
    try {
      const id=request.params.id;
      if(typeof id!=="string" || !id) {
        sendError(response,400,"VALIDATION_ERROR","Request ID required.");return;
      }
      const auth=request.auth!;
      const data=await prisma.assetRequest.findFirst({
        where:{id,tenantId:auth.tenantId!,
          ...(!hasApprove(auth.permissions??[]) ? {requestedById:auth.userId} : {}),
        },include,
      });
      if(!data){sendError(response,404,"REQUEST_NOT_FOUND","Request not found.");return;}
      response.json({data});
    }catch(error){next(error);}
  });

requestRouter.post("/", requirePermission("request.create"), requireCsrf,
  async(request,response,next)=>{
    const parsed=createSchema.safeParse(request.body);
    if(!parsed.success) {
      sendError(response,400,"VALIDATION_ERROR","Complete the request reason and item details.");return;
    }
    try {
      const tenantId=request.auth!.tenantId!;
      const actorUserId=request.auth!.userId;
      const data=await prisma.$transaction(async tx=>{
        const record=await tx.assetRequest.create({
          data:{
            tenantId,requestedById:actorUserId,
            requestType:parsed.data.requestType,
            businessReason:parsed.data.businessReason,
            items:{create:parsed.data.items.map(item=>({...item,tenantId}))},
          },include,
        });
        await tx.auditLog.create({data:{
          tenantId,actorUserId,action:"request.created",entityType:"AssetRequest",
          entityId:record.id,
          newData:{requestType:record.requestType,items:record.items.map(i=>
            ({description:i.description,quantity:i.quantity}))},
          ipAddress:request.ip?.slice(0,64),
        }});
        return record;
      });
      response.status(201).json({data});
    }catch(error){next(error);}
  });

requestRouter.post("/:id/decision", requirePermission("request.approve"), requireCsrf,
  async(request,response,next)=>{
    const parsed=decisionSchema.safeParse(request.body);
    const id=request.params.id;
    if(!parsed.success || typeof id!=="string" || !id){
      sendError(response,400,"VALIDATION_ERROR","A decision and reason are required.");return;
    }
    try {
      const auth=request.auth!;
      const data=await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM AssetRequest WHERE id = ${id} AND tenantId = ${auth.tenantId!} FOR UPDATE`;
        const existing=await tx.assetRequest.findFirst({where:{id,tenantId:auth.tenantId!}});
        if(!existing)throw new Error("REQUEST_NOT_FOUND");
        if(existing.requestedById===auth.userId)throw new Error("SELF_APPROVAL_DENIED");
        if(!["PENDING","CHANGES_REQUESTED"].includes(existing.status))
          throw new Error("REQUEST_NOT_PENDING");
        const record=await tx.assetRequest.update({
          where:{id},data:{
            status:parsed.data.decision,decidedById:auth.userId,
            decidedAt:new Date(),decisionReason:parsed.data.reason,
          },include,
        });
        await tx.auditLog.create({data:{
          tenantId:auth.tenantId!,actorUserId:auth.userId,
          action:"request.decision",entityType:"AssetRequest",entityId:id,
          oldData:{status:existing.status},
          newData:{status:record.status,reason:parsed.data.reason},
          ipAddress:request.ip?.slice(0,64),
        }});
        return record;
      });
      response.json({data});
    }catch(error){
      const code=error instanceof Error ? error.message : "";
      if(["REQUEST_NOT_FOUND","SELF_APPROVAL_DENIED","REQUEST_NOT_PENDING"].includes(code)){
        sendError(response,code==="REQUEST_NOT_FOUND"?404:409,code,
          "Request cannot be approved in its current state.");return;
      }
      if(typeof error==="object"&&error!==null&&"code" in error && error.code==="P2034"){
        sendError(response,409,"REQUEST_CONFLICT","Another decision was recorded. Reload the request.");return;
      }
      next(error);
    }
  });

requestRouter.post("/:id/cancel", requirePermission("request.create"), requireCsrf,
  async(request,response,next)=>{
    const id=request.params.id;
    if(typeof id!=="string" || !id){
      sendError(response,400,"VALIDATION_ERROR","Request ID required.");return;
    }
    try {
      const auth=request.auth!;
      const data=await prisma.$transaction(async tx=>{
        const existing=await tx.assetRequest.findFirst({
          where:{id,tenantId:auth.tenantId!,requestedById:auth.userId},
        });
        if(!existing)throw new Error("REQUEST_NOT_FOUND");
        if(!["PENDING","CHANGES_REQUESTED"].includes(existing.status))
          throw new Error("REQUEST_NOT_PENDING");
        const changed=await tx.assetRequest.updateMany({
          where:{id,tenantId:auth.tenantId!,requestedById:auth.userId,
            status:existing.status},
          data:{status:"CANCELLED"},
        });
        if(changed.count!==1)throw new Error("REQUEST_NOT_PENDING");
        await tx.auditLog.create({data:{
          tenantId:auth.tenantId!,actorUserId:auth.userId,
          action:"request.cancelled",entityType:"AssetRequest",entityId:id,
          oldData:{status:existing.status},newData:{status:"CANCELLED"},
        }});
        return tx.assetRequest.findFirst({where:{id,tenantId:auth.tenantId!},include});
      });
      response.json({data});
    }catch(error){
      const code=error instanceof Error?error.message:"";
      if(["REQUEST_NOT_FOUND","REQUEST_NOT_PENDING"].includes(code)){
        sendError(response,code==="REQUEST_NOT_FOUND"?404:409,code,
          "This request cannot be cancelled.");return;
      }
      next(error);
    }
  });
