import { TestBed } from '@angular/core/testing';
import { DemoNetwork, NETWORK_SPEEDS } from './demo-ports';

describe('Network simulated by the demo', () => {
  afterEach(() => sessionStorage.removeItem('lc.demo.network'));

  it('starts normal, changes delay and remembers it for the browser tab', () => {
    sessionStorage.removeItem('lc.demo.network');
    const network = TestBed.inject(DemoNetwork);
    expect(network.speed()).toBe('normal');
    expect(network.latency()).toBe(NETWORK_SPEEDS.normal);
    network.set('verySlow');
    expect(network.latency()).toBe(9000);
    expect(sessionStorage.getItem('lc.demo.network')).toBe('verySlow');
  });

  it('an unknown stored value goes back to normal', () => {
    sessionStorage.setItem('lc.demo.network', 'instant');
    expect(TestBed.inject(DemoNetwork).speed()).toBe('normal');
  });
});
