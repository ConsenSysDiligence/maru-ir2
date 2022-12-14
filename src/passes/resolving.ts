import {
    BaseSrc,
    Definition,
    FunctionDefinition,
    Identifier,
    MemVariableDeclaration,
    StructDefinition,
    UserDefinedType,
    VariableDeclaration
} from "../ir";
import { walk, MIRTypeError } from "../utils";

type Def = FunctionDefinition | StructDefinition | VariableDeclaration | MemVariableDeclaration;

class Scope {
    private defs: Map<string, Def> = new Map();
    private parentScope: Scope | undefined = undefined;

    constructor(parentScope?: Scope) {
        this.parentScope = parentScope;
    }

    isDefined(name: string): boolean {
        if (this.defs.has(name)) {
            return true;
        }

        return this.parentScope ? this.parentScope.isDefined(name) : false;
    }

    get(name: string): Def | undefined {
        const curDef = this.defs.get(name);
        if (curDef !== undefined) {
            return curDef;
        }

        return this.parentScope ? this.parentScope.get(name) : undefined;
    }

    mustGet(name: string, src: BaseSrc): Def {
        const def = this.get(name);

        if (def === undefined) {
            throw new MIRTypeError(src, `Unknown identifier ${name}`);
        }

        return def;
    }

    getStruct(udT: UserDefinedType): StructDefinition {
        const def = this.get(udT.name);

        if (def === undefined) {
            throw new MIRTypeError(udT.src, `Unknown user defined type ${udT.name}`);
        }

        if (!(def instanceof StructDefinition)) {
            throw new MIRTypeError(udT.src, `Expected struct not ${udT.name}`);
        }

        return def;
    }

    define(arg: Def) {
        const curDef = this.get(arg.name);

        if (curDef !== undefined) {
            throw new MIRTypeError(
                arg.src,
                `Multiple variables/parameters with name ${
                    arg.name
                }. Previous definition at ${curDef.src.pp()}`
            );
        }

        this.defs.set(arg.name, arg);
    }
}

export type TypeDecl = StructDefinition;
/**
 * Simple pass to compute:
 * 1. The VariableDeclaration for each Identifier
 * @todo 2. The FunctionDefinition for every name inside of a FunctionCall
 * 3. The @todo StructDefinition for every UserDefinedType
 */
export class Resolving {
    private _idDecls: Map<
        Identifier,
        VariableDeclaration | MemVariableDeclaration | FunctionDefinition
    >;
    private _typeDecls: Map<UserDefinedType, TypeDecl>;

    constructor(public readonly defs: Definition[]) {
        this._idDecls = new Map();
        this._typeDecls = new Map();

        this.runAnalysis();
    }

    getIdDecl(
        id: Identifier
    ): VariableDeclaration | MemVariableDeclaration | FunctionDefinition | undefined {
        return this._idDecls.get(id);
    }

    getTypeDecl(id: UserDefinedType): TypeDecl | undefined {
        return this._typeDecls.get(id);
    }

    private runAnalysis(): void {
        const global = new Scope();

        for (const def of this.defs) {
            if (def instanceof StructDefinition || def instanceof FunctionDefinition) {
                global.define(def);
            } else {
                throw new Error(`NYI def ${def.pp()}`);
            }
        }

        for (const def of this.defs) {
            if (def instanceof FunctionDefinition) {
                this.analyzeOneFun(def, new Scope(global));
            } else if (def instanceof StructDefinition) {
                this.analyzeOneStruct(def, new Scope(global));
            }
        }
    }

    private analyzeOneStruct(struct: StructDefinition, scope: Scope) {
        for (const memVar of struct.memoryParameters) {
            scope.define(memVar);
        }

        walk(struct, (nd) => {
            if (nd instanceof Identifier) {
                this._idDecls.set(nd, scope.mustGet(nd.name, nd.src));
            } else if (nd instanceof UserDefinedType) {
                this._typeDecls.set(nd, scope.getStruct(nd));
            }
        });
    }

    private analyzeOneFun(fun: FunctionDefinition, scope: Scope) {
        for (const mVar of fun.memoryParameters) {
            scope.define(mVar);
        }

        for (const param of fun.parameters) {
            scope.define(param);
        }

        for (const local of fun.locals) {
            scope.define(local);
        }

        for (const child of fun.children()) {
            walk(child, (nd) => {
                if (nd instanceof Identifier) {
                    this._idDecls.set(nd, scope.mustGet(nd.name, nd.src));
                } else if (nd instanceof UserDefinedType) {
                    this._typeDecls.set(nd, scope.getStruct(nd));
                }
            });
        }
    }
}
