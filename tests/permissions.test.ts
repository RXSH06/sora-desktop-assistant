import { describe, it, expect, vi } from 'vitest';
import { DefaultPermissionManager } from '../packages/permissions/src/index.js';

describe('Permission Manager', () => {
  it('automatically approves SAFE tools without confirmation', async () => {
    const manager = new DefaultPermissionManager();
    const result = await manager.checkPermission('search_files', { query: 'PCB' }, 'Search files');
    expect(result.allowed).toBe(true);
  });

  it('triggers confirmation handler for CONFIRM level tools', async () => {
    const confirmationHandler = vi.fn().mockResolvedValue(true);
    const manager = new DefaultPermissionManager({}, confirmationHandler);

    const result = await manager.checkPermission(
      'delete_file',
      { path: '/tmp/test.txt' },
      'Delete file'
    );

    expect(confirmationHandler).toHaveBeenCalled();
    expect(result.allowed).toBe(true);
  });

  it('rejects action if confirmation handler returns false', async () => {
    const confirmationHandler = vi.fn().mockResolvedValue(false);
    const manager = new DefaultPermissionManager({}, confirmationHandler);

    const result = await manager.checkPermission(
      'send_email',
      { to: 'test@example.com' },
      'Send email'
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('denied');
  });

  it('blocks permanently blocked tools immediately', async () => {
    const manager = new DefaultPermissionManager();
    const result = await manager.checkPermission(
      'execute_shell_command',
      { cmd: 'rm -rf /' },
      'Shell execution'
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('BLOCKED');
  });

  it('aborts all operations when Emergency Stop is triggered', async () => {
    const manager = new DefaultPermissionManager();
    manager.triggerEmergencyStop();

    expect(manager.isEmergencyStopped()).toBe(true);

    const result = await manager.checkPermission('search_files', { query: 'test' }, 'Search');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Emergency Stop');

    manager.resetEmergencyStop();
    expect(manager.isEmergencyStopped()).toBe(false);
  });
});
