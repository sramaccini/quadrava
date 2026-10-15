import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { FieldDefinition } from 'schema';
import { IconComponent } from './icon.component';

const DEFAULT_MAX_KB = 1024;
/** Base64 content inside the JSON weighs a third more: beyond this limit multipart is needed. */
const MAX_BASE64_KB = 10240;

/** Is the file allowed by `accept`? Extensions (`.pdf`), exact types (`application/pdf`) and families (`image/*`). */
export function accepts(accept: string | undefined, file: { name: string; type: string }): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => (rule.startsWith('.') ? name.endsWith(rule) : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule));
}

/** Content of a file in base64 (without the `data:` prefix). */
function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * `file` field: one file per field. Type and size are checked before any upload. With `upload` the file
 * goes right away to the data source: in multipart (default) as a real file, in base64 inside the JSON body
 * (variable `file`); the value of the field becomes `{ name, type, size }` plus the service response. Without
 * `upload` the value also contains `content` (base64). The name of the file is always text.
 */
@Component({
  selector: 'lc-file-field',
  imports: [IconComponent, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    button lc-icon { margin-right: 6px; }
    button[nzType="text"] lc-icon { margin-right: 0; }
    .name { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .size { color: var(--lc-color-muted, #5d6b7a); }
    .error { margin: 4px 0 0; color: var(--lc-color-danger, #c62828); }
    input[type='file'] { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  `,
  template: `
    <div class="row">
      <input #picker type="file" [id]="inputId()" [attr.accept]="field().accept ?? null" [disabled]="disabled() || busy()" (change)="picked(picker)" />
      <button nz-button type="button" [nzLoading]="busy()" [disabled]="disabled()" (click)="picker.click()">
        <lc-icon name="upload" />
        {{ i18n.t(file() ? 'lc.replaceFile' : 'lc.chooseFile') }}
      </button>
      @if (file(); as f) {
        <span class="name"><lc-icon name="attachment" />{{ f.name }}</span>
        <span class="size">{{ size(f.size) }}</span>
        @if (!disabled()) {
          <button nz-button nzType="text" nzSize="small" type="button" [attr.aria-label]="i18n.t('lc.removeFile', { name: f.name })" (click)="clear()">
            <lc-icon name="close" />
          </button>
        }
      }
    </div>
    @if (error(); as e) {
      <p class="error" role="alert">{{ e }}</p>
    }
  `,
})
export class FileFieldComponent {
  readonly field = input.required<FieldDefinition>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly value = input<unknown>(null);
  readonly disabled = input(false);
  readonly inputId = input<string | null>(null);
  readonly valueChange = output<unknown>();

  protected readonly i18n = inject(I18n);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');

  /** Current file, read from the value of the field (also when it comes from the initial data). */
  protected readonly file = computed<{ name: string; size: number } | null>(() => {
    const v = this.value();
    if (v === null || typeof v !== 'object') return null;
    const { name, size } = v as Record<string, unknown>;
    return typeof name === 'string' ? { name, size: typeof size === 'number' ? size : 0 } : null;
  });

  protected size(bytes: number): string {
    const kb = bytes / 1024;
    const format = new Intl.NumberFormat(this.i18n.intlLocale(), { maximumFractionDigits: 1 });
    return kb >= 1024 ? `${format.format(kb / 1024)} MB` : `${format.format(Math.max(kb, 0.1))} KB`;
  }

  protected async picked(input: HTMLInputElement): Promise<void> {
    const chosen = input.files?.[0];
    input.value = '';
    if (!chosen) return;
    const field = this.field();
    const multipart = !!field.upload && field.uploadAs !== 'base64';
    const max = Math.min(field.maxSizeKb ?? DEFAULT_MAX_KB, multipart ? Infinity : MAX_BASE64_KB);
    if (!accepts(field.accept, chosen)) {
      this.error.set(this.i18n.t('lc.fileType', { accept: field.accept ?? '' }));
      return;
    }
    if (chosen.size > max * 1024) {
      this.error.set(this.i18n.t('lc.fileTooLarge', { max: max >= 1024 ? `${max / 1024} MB` : `${max} KB` }));
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      const meta = { name: chosen.name, type: chosen.type, size: chosen.size };
      let result;
      if (multipart) {
        result = await this.runtime().execute(field.upload!, { file: meta }, this.scope(), { field: 'file', name: chosen.name, type: chosen.type, blob: chosen });
      } else {
        const content = await readBase64(chosen);
        if (!field.upload) {
          this.valueChange.emit({ ...meta, content });
          return;
        }
        result = await this.runtime().execute(field.upload, { file: { ...meta, content } }, this.scope());
      }
      if (!result.ok) {
        this.error.set(this.i18n.t('lc.uploadFailed'));
        return;
      }
      const response = result.data !== null && typeof result.data === 'object' && !Array.isArray(result.data) ? (result.data as Record<string, unknown>) : {};
      this.valueChange.emit({ ...response, ...meta });
    } catch {
      this.error.set(this.i18n.t('lc.uploadFailed'));
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    this.error.set(null);
    const picker = this.picker()?.nativeElement;
    if (picker) picker.value = '';
    this.valueChange.emit(null);
  }
}
