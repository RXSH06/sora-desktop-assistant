import { describe, it, expect } from 'vitest';
import { openApplicationTool, listRunningApplicationsTool } from '../packages/tools/src/index.js';

describe('Application Control Tools', () => {
  it('blocks applications that are not in the approved allowlist', async () => {
    const res = await openApplicationTool.execute({
      appName: 'malicious_script_or_random_binary',
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('allowlist');
  });

  it('lists running desktop applications or processes safely', async () => {
    const res = await listRunningApplicationsTool.execute();
    expect(res.success).toBe(true);
    expect(res.output).toBeDefined();
  });
});
