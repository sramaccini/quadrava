import { TestBed } from '@angular/core/testing';
import { DemoNetwork, NETWORK_SPEEDS } from './demo-ports';

describe('Rete simulata della demo', () => {
  afterEach(() => sessionStorage.removeItem('lc.demo.rete'));

  it('parte normale, cambia ritardo e lo ricorda per la scheda del browser', () => {
    sessionStorage.removeItem('lc.demo.rete');
    const network = TestBed.inject(DemoNetwork);
    expect(network.speed()).toBe('normale');
    expect(network.latency()).toBe(NETWORK_SPEEDS.normale);
    network.set('moltoLenta');
    expect(network.latency()).toBe(9000);
    expect(sessionStorage.getItem('lc.demo.rete')).toBe('moltoLenta');
  });

  it('un valore memorizzato sconosciuto torna a normale', () => {
    sessionStorage.setItem('lc.demo.rete', 'istantanea');
    expect(TestBed.inject(DemoNetwork).speed()).toBe('normale');
  });
});
