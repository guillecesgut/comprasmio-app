/**
 * Versión web de Alert y ActionSheetIOS (react-native-web no los trae: Alert.alert no hace nada,
 * Alert.prompt y ActionSheetIOS no existen). Mismos nombres y firmas que en nativo, así las
 * pantallas no cambian. Modales en DOM puro, sin depender del árbol de React.
 */
type Btn = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: (value?: string) => void };

const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function open(opts: { title?: string; message?: string; buttons: Btn[]; input?: { value: string }; sheet?: boolean }) {
  const { title, message, buttons, input, sheet } = opts;
  const overlay = el('div', `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;justify-content:center;align-items:${sheet ? 'flex-end' : 'center'};padding:16px;font-family:${FONT}`);
  const box = el('div', `background:#fff;border-radius:16px;width:100%;max-width:360px;padding:18px 16px 12px;box-shadow:0 10px 40px rgba(0,0,0,.25);max-height:85vh;overflow:auto`);
  if (title) box.appendChild(el('div', 'font-size:17px;font-weight:700;color:#1c1c1e;text-align:center', title));
  if (message) box.appendChild(el('div', 'font-size:14px;color:#6b6b70;text-align:center;margin-top:6px;line-height:1.35', message));
  let field: HTMLInputElement | null = null;
  if (input) {
    field = el('input', 'width:100%;box-sizing:border-box;margin-top:12px;padding:10px 12px;border:1px solid #d1d1d6;border-radius:10px;font-size:16px;font-family:inherit');
    field.value = input.value;
    box.appendChild(field);
  }
  const cancel = buttons.find((b) => b.style === 'cancel');
  let done = false;
  const close = (b?: Btn) => {
    if (done) return;
    done = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    b?.onPress?.(field ? field.value : undefined);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(cancel);
    if (e.key === 'Enter' && field) close(buttons.find((b) => b.style !== 'cancel'));
  };
  document.addEventListener('keydown', onKey);

  const list = el('div', 'margin-top:14px;display:flex;flex-direction:column;gap:8px');
  buttons.forEach((b) => {
    const color = b.style === 'destructive' ? '#d92d20' : b.style === 'cancel' ? '#1c1c1e' : '#0E7C66';
    const bg = b.style === 'cancel' ? '#f1ede7' : '#f6f4f0';
    const btn = el('button', `border:0;border-radius:12px;padding:13px;font-size:16px;font-weight:${b.style === 'cancel' ? 500 : 700};color:${color};background:${bg};cursor:pointer;font-family:inherit`, b.text || 'OK');
    btn.type = 'button';
    btn.onclick = () => close(b);
    list.appendChild(btn);
  });
  box.appendChild(list);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(cancel); });
  document.body.appendChild(overlay);
  (field || (list.lastElementChild as HTMLElement | null))?.focus();
  field?.select();
}

export const Alert = {
  alert(title: string, message?: string, buttons?: Btn[]) {
    open({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
  },
  prompt(title: string, message?: string, callbackOrButtons?: ((text: string) => void) | Btn[], _type?: string, defaultValue?: string) {
    const buttons: Btn[] =
      typeof callbackOrButtons === 'function'
        ? [{ text: 'Cancelar', style: 'cancel' }, { text: 'OK', onPress: (v) => callbackOrButtons(v ?? '') }]
        : callbackOrButtons?.length ? callbackOrButtons : [{ text: 'Cancelar', style: 'cancel' }, { text: 'OK' }];
    open({ title, message, buttons, input: { value: defaultValue || '' } });
  },
};

export const ActionSheetIOS = {
  showActionSheetWithOptions(
    o: { title?: string; message?: string; options: string[]; destructiveButtonIndex?: number | number[]; cancelButtonIndex?: number },
    callback: (index: number) => void,
  ) {
    const destructive = ([] as number[]).concat(o.destructiveButtonIndex ?? []);
    open({
      title: o.title,
      message: o.message,
      sheet: true,
      buttons: o.options.map((text, i) => ({
        text,
        style: i === o.cancelButtonIndex ? 'cancel' : destructive.includes(i) ? 'destructive' : 'default',
        onPress: () => callback(i),
      })),
    });
  },
};
