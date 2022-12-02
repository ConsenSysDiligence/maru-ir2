import { Type } from "./type";

export class TypeVar<SrcT> extends Type<SrcT> {
    constructor(id: number, src: SrcT, public readonly name: string) {
        super(id, src);
    }

    pp(): string {
        return this.name;
    }

    getStructId(): any {
        return this.name;
    }
}
