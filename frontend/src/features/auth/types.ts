export interface AuthMembership {
  id: string;
  role: {
    id: string;
    key: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  memberships: AuthMembership[];
}

export type AuthMode = "login" | "register";
