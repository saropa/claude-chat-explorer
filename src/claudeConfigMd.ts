/** Markdown handover for the Claude config panel: facts, findings and an optimisation prompt in one block. */
import { ConfigReport, Level } from './claudeConfig';

export const OPT_PROMPT = 'Review the Claude Code configuration above. For each finding, say whether it is a real problem, then propose the smallest concrete edit (file, old text, new text). Also look for instructions that are duplicated, contradictory, vague or too long, and for permissions that could be tightened or safely widened. Do not change anything until I approve.';

const section = (title: string, lv: Level | undefined): string => {
  if (!lv) { return ''; }
  const f = lv.facts.map((x) => '- ' + x.label + ': ' + x.value).join('\n') || '- (none found)';
  const n = lv.findings.map((x) => '- [' + x.category + ', ' + x.severity + '] ' + x.text).join('\n') || '- (none)';
  return '## ' + title + '\n\n### Facts\n' + f + '\n\n### Findings\n' + n + '\n\n';
};

export function configMarkdown(rep: ConfigReport): string {
  return '# Claude Code configuration\n\n' + section('Global (~/.claude)', rep.global) + section('Project', rep.project) + '## Task\n\n' + OPT_PROMPT + '\n';
}
