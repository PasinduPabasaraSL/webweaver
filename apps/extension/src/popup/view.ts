import type { PopupViewModel } from './view-model';

export interface PopupElements {
  status: HTMLElement;
  detail: HTMLElement;
  startButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  downloadButton: HTMLButtonElement;
  actions: HTMLOListElement;
  error: HTMLElement;
}

function requireElement<T extends HTMLElement>(root: Document, id: string, type: new () => T): T {
  const element = root.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Popup markup is missing #${id}.`);
  return element;
}

export function queryPopupElements(root: Document): PopupElements {
  return {
    status: requireElement(root, 'status', HTMLElement),
    detail: requireElement(root, 'detail', HTMLElement),
    startButton: requireElement(root, 'start', HTMLButtonElement),
    stopButton: requireElement(root, 'stop', HTMLButtonElement),
    downloadButton: requireElement(root, 'download', HTMLButtonElement),
    actions: requireElement(root, 'actions', HTMLOListElement),
    error: requireElement(root, 'error', HTMLElement),
  };
}

export function render(elements: PopupElements, model: PopupViewModel): void {
  elements.status.textContent = model.statusLabel;
  elements.status.dataset['state'] = model.isRecording ? 'recording' : 'idle';
  elements.detail.textContent = model.detail;
  elements.startButton.disabled = !model.canStart;
  elements.stopButton.disabled = !model.canStop;
  elements.downloadButton.disabled = !model.canDownload;
  elements.downloadButton.textContent = model.downloadLabel;

  const items = model.recentActions.map((text) => {
    const item = elements.actions.ownerDocument.createElement('li');
    item.textContent = text;
    return item;
  });
  elements.actions.replaceChildren(...items);
  elements.actions.hidden = items.length === 0;
}

export function showError(elements: PopupElements, message: string | undefined): void {
  elements.error.textContent = message ?? '';
  elements.error.hidden = !message;
}
