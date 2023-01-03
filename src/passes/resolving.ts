import {
    ArrayType,
    BaseSrc,
    BoolType,
    Definition,
    FunctionCall,
    FunctionDefinition,
    Identifier,
    IntType,
    MemConstant,
    MemIdentifier,
    MemVariableDeclaration,
    PointerType,
    StructDefinition,
    Type,
    TypeVariableDeclaration,
    UserDefinedType,
    VariableDeclaration
} from "../ir";
import { walk, MIRTypeError, pp } from "../utils";

type Def =
    | FunctionDefinition
    | StructDefinition
    | VariableDeclaration
    | MemVariableDeclaration
    | TypeVariableDeclaration
    | MemIdentifier;

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

    getTypeDecl(udT: UserDefinedType): StructDefinition | TypeVariableDeclaration {
        const def = this.get(udT.name);

        if (def === undefined) {
            throw new MIRTypeError(udT.src, `Unknown user defined type ${udT.name}`);
        }

        if (!(def instanceof StructDefinition || def instanceof TypeVariableDeclaration)) {
            throw new MIRTypeError(
                udT.src,
                `Name ${udT.pp()} doesn't resolve to a type or type var.`
            );
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

    /**
     * Make a child scope of the current scope, corresponding ot the given function.
     */
    makeFunScope(fun: FunctionDefinition): Scope {
        const scope = new Scope(this);

        // 1. Define mem vars, type vars, params and locals in the function scope
        for (const mVar of fun.memoryParameters) {
            scope.define(mVar);
        }

        for (const node of fun.children()) {
            if (node instanceof FunctionCall) {
                for (const memArg of node.memArgs) {
                    if (memArg instanceof MemIdentifier && memArg.out) {
                        scope.define(memArg);
                    }
                }
            }
        }

        for (const tVar of fun.typeParameters) {
            scope.define(tVar);
        }

        for (const param of fun.parameters) {
            scope.define(param);
        }

        for (const local of fun.locals) {
            scope.define(local);
        }

        return scope;
    }

    /**
     * Make a child scope of the current scope, corresponding ot the given struct.
     */
    makeStructScope(struct: StructDefinition): Scope {
        const scope = new Scope(this);

        // Define mem vars and type vars
        for (const memVar of struct.memoryParameters) {
            scope.define(memVar);
        }

        for (const tVar of struct.typeParameters) {
            scope.define(tVar);
        }

        return scope;
    }
}

export type TypeDecl = StructDefinition | TypeVariableDeclaration;
/**
 * Simple pass to compute:
 * 1. The VariableDeclaration for each Identifier
 * @todo 2. The FunctionDefinition for every name inside of a FunctionCall
 * 3. The @todo StructDefinition for every UserDefinedType
 */
export class Resolving {
    private _idDecls: Map<
        Identifier | MemIdentifier,
        VariableDeclaration | MemVariableDeclaration | FunctionDefinition
    >;
    private _typeDecls: Map<UserDefinedType, TypeDecl>;

    constructor(public readonly defs: Definition[]) {
        this._idDecls = new Map();
        this._typeDecls = new Map();

        this.runAnalysis();
    }

    getMemIdDecl(id: MemIdentifier): MemVariableDeclaration | MemIdentifier | undefined {
        return this._idDecls.get(id) as MemVariableDeclaration | MemIdentifier | undefined;
    }

    getIdDecl(id: Identifier): VariableDeclaration | FunctionDefinition | undefined {
        return this._idDecls.get(id) as VariableDeclaration | FunctionDefinition | undefined;
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
            let defScope: Scope;

            if (def instanceof FunctionDefinition) {
                defScope = global.makeFunScope(def);
            } else if (def instanceof StructDefinition) {
                defScope = global.makeStructScope(def);
            } else {
                throw new Error(`NYI def ${def.pp}`);
            }

            this.analyzeOneDef(def, defScope);
        }

        // After we build the resolving maps, check that fresh/out memories are used correctly
        for (const def of this.defs) {
            this.checkIdentifiers(def as FunctionDefinition | StructDefinition);
        }
    }

    /**
     * Return true IFF `t` is a primitive type. Note we need resolving, to distinguish type vars from structures, as they
     * both look like a UserDefinedType.
     */
    public isPrimitive(t: Type): boolean {
        if (t instanceof IntType || t instanceof BoolType || t instanceof PointerType) {
            return true;
        }

        if (t instanceof UserDefinedType) {
            const decl = this._typeDecls.get(t);

            if (decl === undefined) {
                throw new MIRTypeError(t.src, `Unknown type ${t.pp()}`);
            }

            return decl instanceof TypeVariableDeclaration;
        }

        return false;
    }

    /**
     * Check whether a type makes sense. Specifically we can only have pointers to and arrays of a primitive type.
     */
    private checkType(t: Type): void {
        if (t instanceof PointerType && this.isPrimitive(t.toType)) {
            throw new MIRTypeError(t.src, `Cannot have primitive type in pointer type ${t.pp()}`);
        }

        if (t instanceof ArrayType && !this.isPrimitive(t.baseType)) {
            throw new MIRTypeError(t.src, `Cannot have arrays of non-primitive type: ${t.pp()}`);
        }

        if (t instanceof UserDefinedType) {
            const decl = this.getTypeDecl(t);

            if (decl === undefined) {
                throw new MIRTypeError(t.src, `Unkown type ${t.name}`);
            }

            if (decl instanceof TypeVariableDeclaration) {
                if (t.memArgs.length !== 0 || t.typeArgs.length !== 0) {
                    throw new MIRTypeError(
                        t.src,
                        `Unexpected type var ${t.name} with polymorphic arguments.`
                    );
                }
            } else {
                if (decl.memoryParameters.length !== t.memArgs.length) {
                    throw new MIRTypeError(
                        t.src,
                        `Mismatch in number of memory args ${t.memArgs.length} and expected number of memory args ${decl.memoryParameters.length}`
                    );
                }

                if (decl.typeParameters.length !== t.typeArgs.length) {
                    throw new MIRTypeError(
                        t.src,
                        `Mismatch in number of type args ${t.typeArgs.length} and expected number of type args ${decl.typeParameters.length}`
                    );
                }
            }
        }
    }

    private analyzeOneDef(def: StructDefinition | FunctionDefinition, scope: Scope) {
        // 1. Resolve all identifiers/user-defined types to their declaration
        walk(def, (nd) => {
            if (nd instanceof Identifier || nd instanceof MemIdentifier) {
                this._idDecls.set(
                    nd,
                    scope.mustGet(nd.name, nd.src) as
                        | VariableDeclaration
                        | MemVariableDeclaration
                        | FunctionDefinition
                );
            } else if (nd instanceof UserDefinedType) {
                this._typeDecls.set(nd, scope.getTypeDecl(nd));
            }
        });

        // 2. Check all types make sense given the resolution. (With resolution we can distinguish TVars from Structs)
        walk(def, (nd) => {
            if (nd instanceof Type) {
                this.checkType(nd);
            }
        });

        // 3. For structs check all fields are primitive
        //    For functions check that all params/locals/returns are primitive
        if (def instanceof StructDefinition) {
            for (const [name, fieldT] of def.fields) {
                if (!this.isPrimitive(fieldT)) {
                    throw new MIRTypeError(
                        fieldT.src,
                        `Field ${name} of struct ${def.name} must be primitive, not ${fieldT.pp()}`
                    );
                }
            }
        } else {
            for (const param of def.parameters) {
                if (!this.isPrimitive(param.type)) {
                    throw new MIRTypeError(
                        def.src,
                        `Cannot have non-primitive parameter ${def.name} in function ${def.name}`
                    );
                }
            }

            for (const local of def.locals) {
                if (!this.isPrimitive(local.type)) {
                    throw new MIRTypeError(
                        def.src,
                        `Cannot have non-primitive local ${def.name} in function ${def.name}`
                    );
                }
            }

            for (const t of def.returns) {
                if (!this.isPrimitive(t)) {
                    throw new MIRTypeError(
                        def.src,
                        `Cannot return non-primitive type ${t.pp()} in function ${def.name}`
                    );
                }
            }
        }
    }

    private checkIdentifiers(def: FunctionDefinition | StructDefinition): void {
        walk(def, (nd) => {
            if (nd instanceof Identifier) {
                const decl = this._idDecls.get(nd);

                if (!(decl instanceof VariableDeclaration || decl instanceof FunctionDefinition)) {
                    throw new MIRTypeError(
                        nd.src,
                        `Expression identifier ${
                            nd.name
                        } should refer to variable or function, not ${pp(decl)}`
                    );
                }
                return;
            }

            if (nd instanceof MemIdentifier) {
                const decl = this._idDecls.get(nd);

                if (
                    !(
                        decl instanceof MemVariableDeclaration ||
                        (decl instanceof MemIdentifier && decl.out)
                    )
                ) {
                    throw new MIRTypeError(
                        nd.src,
                        `Memory identifier ${
                            nd.name
                        } should refer to a memory variable declarations or out mem parameters, not ${pp(
                            decl
                        )}`
                    );
                }

                return;
            }

            if (nd instanceof StructDefinition) {
                for (const decl of nd.memoryParameters) {
                    if (decl.fresh) {
                        throw new MIRTypeError(decl.src, `Struct cannot have fresh memories`);
                    }
                }

                return;
            }

            if (nd instanceof FunctionCall) {
                const funDecl = this._idDecls.get(nd.callee) as FunctionDefinition;

                for (let i = 0; i < nd.memArgs.length; i++) {
                    const arg = nd.memArgs[i];
                    const argDecl = funDecl.memoryParameters[i];

                    if (arg instanceof MemConstant) {
                        if (argDecl.fresh) {
                            throw new MIRTypeError(
                                arg.src,
                                `Cannot pass in memory constant ${
                                    arg.name
                                } for a fresh memory var ${pp(argDecl)}`
                            );
                        }

                        continue;
                    }

                    if (arg.out && !argDecl.fresh) {
                        throw new MIRTypeError(
                            arg.src,
                            `Cannot declare memory ${arg.name} as out if correspoarging var ${pp(
                                argDecl
                            )} is not fresh`
                        );
                    }

                    if (!arg.out && argDecl.fresh) {
                        throw new MIRTypeError(
                            arg.src,
                            `Cannot pass in memory var ${arg.name} for a fresh memory var ${pp(
                                argDecl
                            )}`
                        );
                    }
                }

                return;
            }
        });
    }
}
