import { verifyCgncEtatsFixtures } from '@/app/lib/atlas-cgnc-etats';

const result = verifyCgncEtatsFixtures();
if (!result.ok) {
  console.error('CGNC/CGI verification failed:');
  for (const f of result.failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('CGNC/CGI verification passed (Bilan équilibre, CPC, tableau de passage, IS/CM).');
