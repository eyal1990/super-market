import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repository = 'eyal1990/super-market';
const requestedNumbers = process.argv.slice(2).flatMap((value) => value.split(','));
const issueNumbers = (requestedNumbers.length ? requestedNumbers : ['20', '30'])
  .map((value) => Number(value.trim()))
  .filter((value, index, values) => Number.isInteger(value) && value > 0 && values.indexOf(value) === index);

if (issueNumbers.length === 0) {
  throw new Error('Provide one or more issue numbers, for example: npm run issues:sync -- 20 30');
}

const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'issue-contracts');
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'super-market-issue-contract-sync',
};

await mkdir(outputDirectory, { recursive: true });

for (const number of issueNumbers) {
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${number}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub issue #${number} could not be read: HTTP ${response.status}`);
  }

  const issue = await response.json();
  const body = String(issue.body ?? '').trim();
  const synchronizedAt = new Date().toISOString();
  const snapshot = [
    `# GitHub issue #${issue.number} — ${issue.title}`,
    '',
    `- Source: ${issue.html_url}`,
    `- State when synchronized: ${issue.state}`,
    `- Synchronized at: ${synchronizedAt}`,
    '',
    body,
    '',
  ].join('\n');

  await writeFile(join(outputDirectory, `${issue.number}.md`), snapshot, 'utf8');
  console.log(`Updated docs/issue-contracts/${issue.number}.md`);
}
