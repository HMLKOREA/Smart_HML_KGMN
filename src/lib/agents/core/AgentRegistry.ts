/**
 * AgentRegistry — 에이전트 중앙 관리자
 *
 * 모든 모듈 에이전트를 등록/조회/관리합니다.
 * 싱글톤 패턴으로 앱 전체에서 하나의 레지스트리 사용.
 */

import type { AgentEvent, AgentEventHandler, AgentEventType } from './types';
import type { BaseAgent } from './BaseAgent';

class AgentRegistryClass {
  private agents = new Map<string, BaseAgent>();
  private globalListeners = new Map<AgentEventType, Set<AgentEventHandler>>();

  // ─── 등록/해제 ────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(agent: BaseAgent<any>): void {
    const id = agent.getConfig().id;
    if (this.agents.has(id)) {
      console.warn(`[AgentRegistry] 에이전트 중복 등록: ${id} (덮어씀)`);
      this.agents.get(id)?.destroy();
    }
    this.agents.set(id, agent);

    // 글로벌 이벤트 포워딩
    const allTypes: AgentEventType[] = [
      'data:loaded', 'data:created', 'data:updated', 'data:deleted',
      'data:refreshed', 'error', 'status:changed', 'config:changed',
    ];
    for (const type of allTypes) {
      agent.on(type, (event) => {
        this.globalListeners.get(type)?.forEach(h => h(event));
      });
    }

    console.log(`[AgentRegistry] 등록: ${id} (${agent.getConfig().name})`);
  }

  unregister(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.destroy();
      this.agents.delete(id);
      console.log(`[AgentRegistry] 해제: ${id}`);
    }
  }

  // ─── 조회 ─────────────────────────────────────

  get<T extends BaseAgent>(id: string): T | undefined {
    return this.agents.get(id) as T | undefined;
  }

  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getAllIds(): string[] {
    return Array.from(this.agents.keys());
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  // ─── 글로벌 이벤트 ───────────────────────────

  on(type: AgentEventType, handler: AgentEventHandler): () => void {
    if (!this.globalListeners.has(type)) {
      this.globalListeners.set(type, new Set());
    }
    this.globalListeners.get(type)!.add(handler);
    return () => {
      this.globalListeners.get(type)?.delete(handler);
    };
  }

  // ─── 전체 제어 ────────────────────────────────

  startAll(): void {
    this.agents.forEach(agent => {
      if (agent.getConfig().autoRefreshInterval > 0) {
        agent.startAutoRefresh();
      }
    });
  }

  stopAll(): void {
    this.agents.forEach(agent => agent.stopAutoRefresh());
  }

  destroyAll(): void {
    this.agents.forEach(agent => agent.destroy());
    this.agents.clear();
    this.globalListeners.clear();
  }

  // ─── 상태 리포트 ──────────────────────────────

  getStatusReport(): {
    id: string;
    name: string;
    enabled: boolean;
    status: string;
    dataCount: number;
    lastRefresh: string | null;
  }[] {
    return Array.from(this.agents.values()).map(agent => {
      const config = agent.getConfig();
      const state = agent.getState();
      return {
        id: config.id,
        name: config.name,
        enabled: config.enabled,
        status: state.status,
        dataCount: state.dataCount,
        lastRefresh: state.lastRefresh,
      };
    });
  }
}

/** 싱글톤 레지스트리 */
export const AgentRegistry = new AgentRegistryClass();
