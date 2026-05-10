import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { utcNow, resolvePath, readJsonFile, atomicWriteTextInRepo } from "./helpers.js";

export interface TaskLease {
  lease_id: string;
  task_id: string;
  owner_pid: number;
  acquired_at: string;
  expires_at: string;
  heartbeat_at: string;
}

export interface TaskItem {
  id: string;
  goal: string;
  metric: string;
  verify: string;
  status: "pending" | "leased" | "completed" | "failed";
  created_at: string;
  lease_attempts: number;
}

export interface TaskQueueManifest {
  tasks: TaskItem[];
  leases: Record<string, TaskLease>;
  updated_at: string;
}

const TASK_QUEUE_FILE = ".autoresearch/task-queue.json";
export const DEFAULT_LEASE_TIMEOUT_MS = 5 * 60 * 1000;

export function resolveQueuePath(repo?: string): string {
  return resolvePath(repo, undefined, TASK_QUEUE_FILE);
}

export function createTask(goal: string, metric: string, verify: string): TaskItem {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    goal,
    metric,
    verify,
    status: "pending",
    created_at: utcNow(),
    lease_attempts: 0,
  };
}

export function createLease(taskId: string, leaseTimeoutMs = DEFAULT_LEASE_TIMEOUT_MS): TaskLease {
  return {
    lease_id: `lease-${process.pid}-${Date.now()}`,
    task_id: taskId,
    owner_pid: process.pid,
    acquired_at: utcNow(),
    expires_at: new Date(Date.now() + leaseTimeoutMs).toISOString(),
    heartbeat_at: utcNow(),
  };
}

export function isLeaseExpired(lease: TaskLease): boolean {
  return new Date(lease.expires_at).getTime() < Date.now();
}

export async function readManifest(queuePath: string): Promise<TaskQueueManifest> {
  try {
    if (!existsSync(queuePath)) {
      return { tasks: [], leases: {}, updated_at: utcNow() };
    }
    const raw = readJsonFile(queuePath) as unknown;
    const data = raw as Record<string, unknown>;
    return {
      tasks: Array.isArray(data.tasks) ? data.tasks as TaskItem[] : [],
      leases: (data.leases as Record<string, TaskLease>) ?? {},
      updated_at: typeof data.updated_at === "string" ? data.updated_at : utcNow(),
    };
  } catch {
    return { tasks: [], leases: {}, updated_at: utcNow() };
  }
}

export async function writeManifest(
  queuePath: string,
  manifest: TaskQueueManifest,
  repo?: string,
): Promise<void> {
  const repoRoot = repo ?? dirname(dirname(resolve(queuePath)));
  atomicWriteTextInRepo(repoRoot, queuePath, JSON.stringify(manifest, null, 2) + "\n");
}

export async function enqueueTasks(
  repo: string | undefined,
  items: Array<{ goal: string; metric: string; verify: string }>,
): Promise<TaskItem[]> {
  const queuePath = resolveQueuePath(repo);
  const manifest = await readManifest(queuePath);
  const newTasks = items.map((item) => createTask(item.goal, item.metric, item.verify));
  manifest.tasks.push(...newTasks);
  manifest.updated_at = utcNow();
  await writeManifest(queuePath, manifest, repo);
  return newTasks;
}

export async function listTasks(repo?: string): Promise<TaskQueueManifest> {
  return readManifest(resolveQueuePath(repo));
}
