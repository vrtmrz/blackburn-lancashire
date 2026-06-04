import { App, FuzzySuggestModal } from "obsidian";

export class PopoverSelectString extends FuzzySuggestModal<string> {
    _app: App;
    callback: ((e: string) => void) | undefined = () => { };
    getItemsFun: () => string[] = () => {
        return ["yes", "no"];
    };

    constructor(
        app: App,
        note: string,
        placeholder: string | undefined,
        getItemsFun: (() => string[]) | undefined,
        callback: (e: string) => void
    ) {
        super(app);
        this._app = app;
        this.setPlaceholder((placeholder ?? "y/n) ") + note);
        if (getItemsFun) this.getItemsFun = getItemsFun;
        this.callback = callback;

        this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                const hasSelection = this.modalEl.querySelector(".suggestion-item.is-selected") !== null;
                if (!hasSelection) {
                    const value = this.inputEl.value.trim();
                    if (value) {
                        this.callback?.(value);
                        this.callback = undefined;
                        this.close();
                    }
                }
            }
        });
    }

    getItems(): string[] {
        return this.getItemsFun();
    }

    getItemText(item: string): string {
        return item;
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        // debugger;
        this.callback?.(item);
        this.callback = undefined;
    }
    override onClose(): void {
        activeWindow.setTimeout(() => {
            if (this.callback) {
                this.callback("");
                this.callback = undefined;
            }
        }, 100);
    }
}

export const askSelectString = (app: App, message: string, items: string[]): Promise<string> => {
    const getItemsFun = () => items;
    return new Promise((res) => {
        const popover = new PopoverSelectString(app, message, "", getItemsFun, (result) => res(result));
        popover.open();
    });
};
