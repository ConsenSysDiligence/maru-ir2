import { Type } from "./type";

export class PointerType<SrcT> extends Type<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly baseType: Type<SrcT>,
        public readonly region: string // TODO (@dimo): Pick better type for storing regions
    ) {
        super(id, src);
    }

    pp(): string {
        return `${this.baseType.pp()} * ${this.region}`;
    }

    getStructId(): any {
        return this.pp();
    }
}
