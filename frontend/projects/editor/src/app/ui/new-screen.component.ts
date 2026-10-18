import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { SCREEN_ID, screenIdFrom } from '../model/templates';

/** What a new resource (or project) is created with: its name or title, its identifier and, for a project, where it goes. */
export interface NewResource {
  title: string;
  id: string;
  location?: 'disk' | 'browser';
}

/** Kinds created with this dialog: they all have an identifier derived from a name. */
export type NewResourceKind = 'screen' | 'datasources' | 'theme' | 'project';

/**
 * Content of the «New screen» dialog, and of those for a new theme, data sources document or project: a name (title of
 * the screen, name of the theme or of the application, description of the data sources) and the identifier. The identifier
 * follows the name until it is changed by hand; emptied, it follows it again. «Create» stays off while the name is missing,
 * the identifier is not in kebab-case or another resource has it. A project also asks where it goes: a folder on disk or the
 * browser.
 */
@Component({
  selector: 'ed-new-screen',
  imports: [FormsModule, NzButtonModule, NzInputModule, NzRadioModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .hint { font-size: 12px; color: var(--lc-color-muted); }
    .error { font-size: 12px; color: var(--lc-color-danger); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    fieldset { margin: 0 0 12px; padding: 0; border: 0; }
    legend { margin-bottom: 4px; font-size: inherit; }
    nz-radio-group { display: flex; flex-direction: column; gap: 4px; }
  `,
  template: `
    <form ngNoForm (submit)="$event.preventDefault(); submit()">
      <div class="field">
        <label for="new-screen-title">{{ i18n.t('ed.newResource.name.' + kind()) }}</label>
        <input #titleInput nz-input id="new-screen-title" maxlength="200" [ngModel]="title()" (ngModelChange)="title.set($event)" />
      </div>
      <div class="field">
        <label for="new-screen-id">{{ i18n.t('ed.newScreen.id') }}</label>
        <input
          nz-input
          id="new-screen-id"
          maxlength="60"
          spellcheck="false"
          [ngModel]="screenId()"
          (ngModelChange)="typedId.set($event.trim() || null)"
          [attr.aria-invalid]="!idValid() || taken()"
          aria-describedby="new-screen-id-hint"
        />
        @if (screenId() && !idValid()) {
          <span class="error" id="new-screen-id-hint">{{ i18n.t('ed.newScreen.idInvalid') }}</span>
        } @else if (taken()) {
          <span class="error" id="new-screen-id-hint">{{ i18n.t('ed.newResource.taken') }}</span>
        } @else {
          <span class="hint" id="new-screen-id-hint">{{ i18n.t('ed.newScreen.idHint') }}</span>
        }
      </div>
      @if (locations().length > 1) {
        <fieldset>
          <legend>{{ i18n.t('ed.newProject.location') }}</legend>
          <nz-radio-group [ngModel]="location()" (ngModelChange)="chosenLocation.set($event)">
            @for (place of locations(); track place) {
              <label nz-radio [nzValue]="place">{{ i18n.t('ed.newProject.' + place) }}</label>
            }
          </nz-radio-group>
        </fieldset>
      }
      <div class="actions">
        <button nz-button type="button" (click)="cancelled.emit()">{{ i18n.t('ed.cancel') }}</button>
        <button nz-button nzType="primary" type="submit" [disabled]="!canCreate()">{{ i18n.t('ed.newScreen.create') }}</button>
      </div>
    </form>
  `,
})
export class NewScreenComponent {
  /** What is being created (the label of the name changes). */
  readonly kind = input<NewResourceKind>('screen');
  /** Identifiers already used by other resources of the same kind. */
  readonly used = input<readonly string[]>([]);
  /** Where a project can go (more than one: the user chooses; the first one is proposed). */
  readonly locations = input<readonly ('disk' | 'browser')[]>([]);
  readonly created = output<NewResource>();
  readonly cancelled = output<void>();
  protected readonly i18n = inject(I18n);
  protected readonly title = signal('');
  protected readonly typedId = signal<string | null>(null);
  protected readonly chosenLocation = signal<'disk' | 'browser' | null>(null);
  protected readonly location = computed(() => this.chosenLocation() ?? this.locations()[0] ?? null);
  protected readonly screenId = computed(() => this.typedId() ?? screenIdFrom(this.title()));
  protected readonly idValid = computed(() => SCREEN_ID.test(this.screenId()));
  protected readonly taken = computed(() => this.used().includes(this.screenId()));
  protected readonly canCreate = computed(() => this.title().trim() !== '' && this.idValid() && !this.taken());
  private readonly titleInput = viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    afterNextRender(() => this.titleInput().nativeElement.focus());
  }

  protected submit(): void {
    if (!this.canCreate()) return;
    const location = this.location();
    this.created.emit({ title: this.title().trim(), id: this.screenId(), ...(location ? { location } : {}) });
  }
}
