import { BaseSrc } from "../ir";

export class MIRError extends Error {}

export class SingleLocError extends MIRError {
    constructor(
        public readonly loc: BaseSrc,
        public readonly type: string,
        msg: string
    ) {
        super(`${type} ${loc.pp()}: ${msg}`);
    }
}

export class MIRSyntaxError extends SingleLocError {
    constructor(
        public readonly loc: BaseSrc,
        msg: string
    ) {
        super(loc, "SyntaxError", msg);
    }
}

export class MIRTypeError extends SingleLocError {
    constructor(
        public readonly loc: BaseSrc,
        msg: string
    ) {
        super(loc, "TypeError", msg);
    }
}
