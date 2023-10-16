import { Node } from "../node";
import { Type } from "./type";

/**
 * Special type marking that a given expression is never evaluated.
 * Used mostly as return type for functions that never return.
 */
export class NeverType extends Type {
    pp(): string {
        return "never";
    }

    getStructId(): any {
        return 0; // All nevers are the same
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(): NeverType {
        return new NeverType(this.src);
    }
}
