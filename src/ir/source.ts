import { PPAble } from "../utils";

export abstract class BaseSrc implements PPAble {
    abstract pp(): string;
}

export type PegsLoc = { offset: number; line: number; column: number };
export type PegsRange = { start: PegsLoc; end: PegsLoc };

export class Src extends BaseSrc {
    constructor(public readonly start: PegsLoc, public readonly end: PegsLoc) {
        super();
    }

    pp(): string {
        return `${this.start.line}:${this.start.column}`;
    }

    static fromPegsRange(r: PegsRange): Src {
        return new Src(r.start, r.end);
    }
}

export class NoSrc extends BaseSrc {
    pp(): string {
        return "";
    }
}

export const noSrc = new NoSrc();
