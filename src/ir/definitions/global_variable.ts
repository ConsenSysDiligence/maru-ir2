import { GlobalVarLiteral } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class GlobalVariable extends Definition {
    public readonly name: string;
    public readonly type: Type;
    public readonly initialValue: GlobalVarLiteral;

    constructor(src: BaseSrc, name: string, type: Type, initialValue: GlobalVarLiteral) {
        super(src);
        this.name = name;
        this.type = type;
        this.initialValue = initialValue;
    }

    pp(): string {
        return `var ${this.name}: ${this.type.pp()} = ${this.initialValue.pp()}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.type, this.initialValue];
    }
}
