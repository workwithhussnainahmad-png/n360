import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { institutions } from "@/db/schema";
import { getPublicSiteBaseDomain } from "./public-site-domain";
import { campusLoginSlug } from "./login-identifiers";

const portals = new Set(["www", "blog", "student", "staff", "parent", "institution", "employee", "sa", "superadmin"]);
export async function isAllowedTlsHostname(domain: string) {
  // The ask parameter is a hostname, never a URL, port, wildcard or IP.
  if (!domain || domain.length>253 || domain!==domain.toLowerCase() || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain)) return false;
  const base=(await getPublicSiteBaseDomain()).trim().toLowerCase();
  const appBase=(process.env.APP_DOMAIN || process.env.NEXT_PUBLIC_APP_DOMAIN || base).trim().toLowerCase();
  if(domain===appBase || [...portals].some(portal=>domain===`${portal}.${appBase}`))return true;
  if(!domain.endsWith(`.${base}`))return false;
  const labels=domain.slice(0,-base.length-1).split(".");
  if(labels.length<1 || labels.length>2 || labels.some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))return false;
  const [root]=await db.select({id:institutions.id,username:institutions.username}).from(institutions).where(and(
    isNull(institutions.parentInstitutionId),isNull(institutions.deletedAt),eq(institutions.status,"APPROVED"),
    or(eq(institutions.publicSlug,labels[0]),eq(institutions.username,labels[0])))).limit(1);
  if(!root)return false;
  if(labels.length===1)return true;
  if(labels[0]!==root.username)return false;
  const campuses=await db.select({name:institutions.campusName}).from(institutions).where(and(eq(institutions.parentInstitutionId,root.id),isNull(institutions.deletedAt),eq(institutions.status,"APPROVED")));
  return campuses.some(campus=>campus.name && campusLoginSlug(campus.name)===labels[1]);
}
