import { EventEmitter } from 'events';
import { SovereignEvent } from '../types/sovereign_types';

class SovereignEmitter extends EventEmitter {
    emitEvent(caseId: string, event: SovereignEvent) {
        this.emit(`case:${caseId}`, event);
    }

    subscribe(caseId: string, callback: (event: SovereignEvent) => void) {
        const channel = `case:${caseId}`;
        this.on(channel, callback);
        return () => this.off(channel, callback);
    }
}

export const sovereignEmitter = new SovereignEmitter();
