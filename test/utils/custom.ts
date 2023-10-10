import { BaseSrc, Node } from "../../src";

export class CustomSrc extends BaseSrc {
    pp(): string {
        return "<custom>";
    }
}

export class CustomNode extends Node {
    children(): Iterable<Node> {
        return [];
    }

    pp(): string {
        return "<custom>";
    }

    getStructId(): any {
        return [];
    }
}
