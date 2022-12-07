import { CFG } from "../cfg";
import { TypeVariableDeclaration, VariableDeclaration } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class FunctionDefinition extends Definition {
    public readonly typeParameters: TypeVariableDeclaration[];
    public readonly memoryParameters: string[];
    public readonly name;
    public readonly parameters: VariableDeclaration[];
    public readonly locals: VariableDeclaration[];
    public readonly returns: Type[];
    public body?: CFG;

    constructor(
        src: BaseSrc,
        memoryParameters: string[],
        typeParameters: TypeVariableDeclaration[],
        name: string,
        params: VariableDeclaration[],
        locals: VariableDeclaration[],
        returns: Type[],
        body?: CFG
    ) {
        super(src);

        this.typeParameters = typeParameters;
        this.memoryParameters = memoryParameters;
        this.name = name;
        this.parameters = params;
        this.locals = locals;
        this.returns = returns;
        this.body = body;
    }

    pp(): string {
        const typeParamStr =
            this.typeParameters.length > 0 ? `<${this.typeParameters.join(", ")}>` : "";
        const memoryParamStr =
            this.memoryParameters.length > 0 ? `[${this.memoryParameters.join(", ")}]` : "";
        const returnStr =
            this.returns.length === 0
                ? ""
                : this.returns.length === 1
                ? `: ${this.returns[0].pp()}`
                : `: (${this.returns.map((x) => x.pp()).join(", ")})`;
        const bodyStr = this.body ? " " + this.body.pp() : "";

        return `fun${memoryParamStr}${typeParamStr} ${this.name}(${this.parameters
            .map((decl) => decl.pp())
            .join(", ")})${returnStr}${bodyStr}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        const bodyChildren: Node[] = [];

        if (this.body) {
            for (const bb of this.body.nodes.values()) {
                bodyChildren.push(...bb.statements);
                for (const edge of bb.outgoing) {
                    if (edge.predicate) {
                        bodyChildren.push(edge.predicate);
                    }
                }
            }
        }

        return [...this.parameters, ...this.locals, ...this.returns, ...bodyChildren];
    }
}
