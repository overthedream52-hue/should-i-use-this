import {z} from 'zod';
const text=(max:number)=>z.string().trim().min(1).max(max);
const ref=z.number().int().min(1).max(120);
const refs=(max:number)=>z.array(ref).max(max).refine(a=>new Set(a).size===a.length,'duplicate reference');
export const publicSourceSchema=z.strictObject({candidateUrl:text(2048),name:text(200),kind:z.enum(['mcp','skill','plugin','software','saas','open_source','service_vendor']),url:text(2048),title:text(300),text:text(12000)});
export const sourceListSchema=z.array(publicSourceSchema).min(1).max(10);
export const sourceBundleSchema=z.strictObject({format:z.literal('source-bundle-v1'),requestKey:z.string().regex(/^[a-f0-9]{32}$/),sources:z.array(publicSourceSchema).max(10)});
export const adoptionAnswerSchema=z.strictObject({format:z.literal('adoption-v4'),requestKey:z.string().regex(/^[a-f0-9]{32}$/),assessments:z.array(z.strictObject({
 candidate:ref,verdict:z.enum(['consider','keep_current','needs_info']),reason:text(800),need:refs(8),gap:refs(8),current:refs(8),offer:text(80).nullable(),
 cost:z.strictObject({kind:z.enum(['free','paid','unknown']),evidence:refs(8)}),
 claims:z.array(z.strictObject({category:z.enum(['identity','capability','price','permission','data_handling','maintenance','license','requirement','process','vendor_claim']),statement:text(500),refs:refs(8).min(1),scope:z.enum(['offer','product','unknown']),offer:text(80).nullable()})).max(12),
 unknowns:z.array(z.strictObject({category:z.enum(['identity','capability','price','permission','data_handling','maintenance','license','requirement','effect']),statement:text(500)})).max(12),
 nextCheck:z.enum(['compare_terms','keep_current','public_sources','ask_user']),question:text(300).optional(),
})).min(1).max(5)});
export type PublicSource=z.infer<typeof publicSourceSchema>;
export type AdoptionAnswer=z.infer<typeof adoptionAnswerSchema>;
