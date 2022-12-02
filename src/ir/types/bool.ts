import { Type } from "./type";

export class BoolType<SrcT> extends Type<SrcT> {
    pp(): string {
        return "bool";
    }

    getStructId(): any {
        return 0; // All bools are the same
    }
}
