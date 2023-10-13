import { ppPolyArgs } from "../../utils";
import { copy } from "../copy";
import { MemDesc } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class UserDefinedType extends Type {
    constructor(
        src: BaseSrc,
        public readonly name: string,
        public readonly memArgs: MemDesc[],
        public readonly typeArgs: Type[]
    ) {
        super(src);
    }

    pp(): string {
        return `${this.name}${ppPolyArgs(this.memArgs, this.typeArgs)}`;
    }

    getStructId(): any {
        return [this.name, ...this.memArgs];
    }

    children(): Iterable<Node> {
        return [...this.memArgs, ...this.typeArgs];
    }

    copy(): UserDefinedType {
        return new UserDefinedType(
            this.src,
            this.name,
            this.memArgs.map(copy),
            this.typeArgs.map(copy)
        );
    }
}
