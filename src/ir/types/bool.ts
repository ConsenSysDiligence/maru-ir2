import { Node } from "../node";
import { Type } from "./type";

export class BoolType extends Type {
    pp(): string {
        return "bool";
    }

    getStructId(): any {
        return 0; // All bools are the same
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(): BoolType {
        return new BoolType(this.src);
    }
}
