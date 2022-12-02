import { CFG } from "../cfg";
import { Type } from "../types";
import { Definition } from "./definition";

export class FunctionDefinition<SrcT> extends Definition<SrcT> {
    public readonly typeParameters: string[];
    public readonly memoryParameters: string[];
    public readonly name;
    public readonly parameters: Array<[string, Type<SrcT>]>;
    public readonly returns: Array<Type<SrcT>>;
    public body?: CFG<SrcT>;

    constructor(
        id: number,
        src: SrcT,
        memoryParameters: string[],
        typeParameters: string[],
        name: string,
        params: Array<[string, Type<SrcT>]>,
        returns: Array<Type<SrcT>>,
        body?: CFG<SrcT>
    ) {
        super(id, src);

        this.typeParameters = typeParameters;
        this.memoryParameters = memoryParameters;
        this.name = name;
        this.parameters = params;
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
        const bodyStr = this.body ? this.body.pp() : "";

        return `fun${memoryParamStr}${typeParamStr} ${this.name}(${this.parameters
            .map(([arg, typ]) => `${arg}: ${typ.pp()}`)
            .join(", ")})${returnStr}${bodyStr}`;
    }

    getStructId(): any {
        return this.pp();
    }
}
