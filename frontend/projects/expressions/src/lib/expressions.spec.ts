import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Expressions } from './expressions';

describe('Expressions', () => {
  let component: Expressions;
  let fixture: ComponentFixture<Expressions>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Expressions],
    }).compileComponents();

    fixture = TestBed.createComponent(Expressions);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
