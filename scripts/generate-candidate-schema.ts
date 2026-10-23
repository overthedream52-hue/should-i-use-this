// Maintainer producer: bun scripts/generate-candidate-schema.ts
// Consumers need only the generated JSON; Python needs no Node/Bun runtime.
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { candidateReviewAnswerSchema } from '../lib/candidate-review-v1';
writeFileSync(new URL('../.agents/skills/should-i-use-this/references/candidate-schema.json', import.meta.url), JSON.stringify(z.toJSONSchema(candidateReviewAnswerSchema), null, 2) + '\n');
import { compactAnswerSchema } from '../lib/candidate-compact';
writeFileSync(new URL('../.agents/skills/should-i-use-this/references/candidate-compact-schema.json', import.meta.url), JSON.stringify(z.toJSONSchema(compactAnswerSchema), null, 2) + '\n');
import { adoptionAnswerSchema,sourceBundleSchema,sourceListSchema } from '../lib/adoption-schema';
writeFileSync(new URL('../.agents/skills/should-i-use-this/references/adoption-schemas.json', import.meta.url), JSON.stringify({answer:z.toJSONSchema(adoptionAnswerSchema),bundle:z.toJSONSchema(sourceBundleSchema),sources:z.toJSONSchema(sourceListSchema)},null,2)+'\n');
