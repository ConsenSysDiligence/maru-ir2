import { TransformerF, transform } from "../copy";
import { Identifier } from "../expressions";
import { MemDesc } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { MapType } from "../types";
import { Statement } from "./statement";

export class AllocMap extends Statement {
    constructor(
        src: BaseSrc,
        public readonly lhs: Identifier,
        public readonly type: MapType,
        public readonly mem: MemDesc
    ) {
        super(src);
    }

    pp(): string {
        return `${this.lhs.pp()} := alloc ${this.type.pp()} in ${this.mem.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.lhs, this.type, this.mem];
    }

    copy(t: TransformerF | undefined): AllocMap {
        return new AllocMap(
            this.src,
            transform(this.lhs, t),
            transform(this.type, t),
            transform(this.mem, t)
        );
    }
}
