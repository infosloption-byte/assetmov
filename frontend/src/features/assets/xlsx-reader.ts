/**
 * Read the first worksheet of an unencrypted .xlsx file without any external
 * scripts. XLSX is ZIP + OOXML. Import only cached CELL VALUES, never formulas
 * or macros. Bounded to small onboarding batches (100 rows).
 */
export async function readXlsxRows(file: File): Promise<string[][]> {
  if (file.size > 2 * 1024 * 1024) throw new Error("XLSX file exceeds 2 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Invalid XLSX archive.");
  const decoder = new TextDecoder();
  const entries = new Map<string, {offset:number;size:number;method:number;rawSize:number}>();
  let pos = u32(eocd + 16);
  const count = u16(eocd + 10);
  if (count > 500 || count === 0) throw new Error("XLSX has too many archive entries.");
  for (let i=0; i<count; i++) {
    if (pos + 46 > bytes.length || u32(pos) !== 0x02014b50) throw new Error("Invalid XLSX directory.");
    const method = u16(pos+10), size = u32(pos+20), rawSize = u32(pos+24);
    const nameLength = u16(pos+28), extra = u16(pos+30), comment = u16(pos+32);
    const local = u32(pos+42);
    if (pos+46+nameLength+extra+comment > bytes.length) throw new Error("Malformed XLSX entry.");
    const name = decoder.decode(bytes.subarray(pos+46,pos+46+nameLength));
    if (rawSize > 12*1024*1024) throw new Error("XLSX worksheet too large.");
    entries.set(name,{offset:local,size,method,rawSize});
    pos += 46+nameLength+extra+comment;
  }
  async function read(name:string):Promise<string> {
    const entry = entries.get(name);
    if (!entry) return "";
    const p = entry.offset;
    if (p+30 > bytes.length || u32(p)!==0x04034b50) throw new Error("Malformed XLSX header.");
    const start = p+30+u16(p+26)+u16(p+28);
    if (start+entry.size > bytes.length) throw new Error("Malformed XLSX content.");
    const compressed = bytes.slice(start,start+entry.size);
    let decoded: Uint8Array;
    if (entry.method===0) decoded=compressed;
    else if (entry.method===8) {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed XLSX files. Use CSV.");
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const buffer=await new Response(stream).arrayBuffer();
      if (buffer.byteLength>12*1024*1024) throw new Error("XLSX worksheet too large.");
      decoded=new Uint8Array(buffer);
    } else throw new Error("Unsupported XLSX compression.");
    return decoder.decode(decoded);
  }
  function xml(input:string):Document {
    const doc=new DOMParser().parseFromString(input,"application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Malformed XLSX XML.");
    return doc;
  }
  const shared: string[] = [];
  const sharedXml = await read("xl/sharedStrings.xml");
  if (sharedXml) {
    const doc=xml(sharedXml);
    for(const si of Array.from(doc.getElementsByTagName("si"))) {
      shared.push(Array.from(si.getElementsByTagName("t")).map(n=>n.textContent??"").join(""));
    }
  }
  // Excel's standard first worksheet is usually sheet1.xml. Resolve the
  // workbook's first relationship when available for nonstandard names.
  let sheetPath="xl/worksheets/sheet1.xml";
  const workbookXml=await read("xl/workbook.xml");
  const relXml=await read("xl/_rels/workbook.xml.rels");
  if(workbookXml && relXml) {
    const wb=xml(workbookXml), rel=xml(relXml);
    const first=wb.getElementsByTagName("sheet")[0];
    const rid=first?.getAttribute("r:id") ??
      first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
    const target=Array.from(rel.getElementsByTagName("Relationship"))
      .find(n=>n.getAttribute("Id")===rid)?.getAttribute("Target");
    if(target) sheetPath=target.startsWith("/") ? target.replace(/^\//,"") :
      target.startsWith("xl/") ? target : "xl/"+target.replace(/^\.\//,"");
  }
  const sheet=await read(sheetPath);
  if(!sheet) throw new Error("First XLSX worksheet was not found.");
  const doc=xml(sheet);
  const output:string[][]=[];
  const cells=Array.from(doc.getElementsByTagName("sheetData")[0]?.getElementsByTagName("row")??[]);
  if(cells.length>101) throw new Error("Import at most 100 XLSX asset rows.");
  for(const row of cells){
    const values:string[]=[];
    for(const cell of Array.from(row.getElementsByTagName("c"))){
      const reference=cell.getAttribute("r")??"";
      const letters=/^[A-Z]+/.exec(reference)?.[0]??"";
      let index=0;
      for(const letter of letters) index=index*26+letter.charCodeAt(0)-64;
      index=Math.max(0,index-1);
      if(index>50) throw new Error("XLSX has too many columns.");
      const type=cell.getAttribute("t");
      let value=cell.getElementsByTagName("v")[0]?.textContent??"";
      if(type==="s") value=shared[Number(value)]??"";
      if(type==="inlineStr") value=Array.from(cell.getElementsByTagName("t"))
        .map(n=>n.textContent??"").join("");
      values[index]=value;
    }
    if(values.some(value=>String(value??"").trim()))output.push(Array.from({length:values.length},(_,i)=>values[i]??""));
  }
  return output;
}
