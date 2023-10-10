import {
    Abort,
    AllocArray,
    AllocMap,
    AllocStruct,
    ArrayLiteral,
    ArrayType,
    Assert,
    Assignment,
    BasicBlock,
    BinaryOperation,
    BoolType,
    BooleanLiteral,
    Branch,
    CFG,
    Cast,
    Contains,
    FunctionCall,
    FunctionDefinition,
    GlobalVariable,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    MapLiteral,
    MapType,
    MemConstant,
    MemIdentifier,
    MemVariableDeclaration,
    NeverType,
    Node,
    NumberLiteral,
    PointerType,
    Return,
    StoreField,
    StoreIndex,
    StructDefinition,
    StructLiteral,
    TransactionCall,
    TypeVariableDeclaration,
    UnaryOperation,
    UserDefinedType,
    VariableDeclaration
} from ".";
import { MIRError, getOrErr } from "../utils";
import { BaseSrc, NoSrc, Src, noSrc } from "./source";

export class MIRCopyError extends MIRError {
    constructor(
        msg: string,
        public readonly node?: Node
    ) {
        super(msg);
    }
}

export function copySrc(src: BaseSrc): BaseSrc {
    if (src instanceof Src) {
        return new Src(src.start, src.end);
    }

    if (src instanceof NoSrc) {
        return noSrc;
    }

    throw new MIRCopyError(`Unable to copy source location "${src.constructor.name}"`);
}

export function copyCfg(cfg: CFG): CFG {
    const cache = new Map<string, BasicBlock>();
    const nodes: BasicBlock[] = [];
    const edges: Array<{ from: string; to: string; predicate?: Node }> = [];

    for (const [name, originalBB] of cfg.nodes) {
        const copyBb = new BasicBlock(name, originalBB.statements.map(copyNode));

        nodes.push(copyBb);

        cache.set(name, copyBb);
    }

    cfg.entry.bfs((bb) => {
        for (const edge of bb.outgoing) {
            edges.push({
                from: edge.from.label,
                to: edge.to.label,
                predicate: edge.predicate ? copyNode(edge.predicate) : undefined
            });
        }
    });

    for (const originalEdge of edges) {
        const from = getOrErr(
            cache,
            originalEdge.from,
            `Missing basic block for edge "from" label "${cfg.entry.label}"`
        );

        const to = getOrErr(
            cache,
            originalEdge.to,
            `Missing basic block for edge "from" label "${cfg.entry.label}"`
        );

        const predicate = originalEdge.predicate ? copyNode(originalEdge.predicate) : undefined;

        from.addOutgoing(to, predicate);
    }

    const entry = getOrErr(
        cache,
        cfg.entry.label,
        `Missing basic block for entry label "${cfg.entry.label}"`
    );

    const exits = cfg.exits.map((bb) =>
        getOrErr(cache, bb.label, `Missing basic block for exit label "${bb.label}"`)
    );

    return new CFG(nodes, entry, exits);
}

export function copyNode<T extends Node>(node: T): T {
    const src = copySrc(node.src);

    if (node instanceof NumberLiteral) {
        return new NumberLiteral(src, node.value, node.radix, copyNode(node.type)) as unknown as T;
    }

    if (node instanceof BooleanLiteral) {
        return new BooleanLiteral(src, node.value) as unknown as T;
    }

    if (node instanceof Cast) {
        return new Cast(src, copyNode(node.toType), copyNode(node.subExpr)) as unknown as T;
    }

    if (node instanceof Identifier) {
        return new Identifier(src, node.name) as unknown as T;
    }

    if (node instanceof UnaryOperation) {
        return new UnaryOperation(src, node.op, copyNode(node.subExpr)) as unknown as T;
    }

    if (node instanceof BinaryOperation) {
        return new BinaryOperation(
            src,
            copyNode(node.leftExpr),
            node.op,
            copyNode(node.rightExpr)
        ) as unknown as T;
    }

    if (node instanceof Abort) {
        return new Abort(src) as unknown as T;
    }

    if (node instanceof AllocArray) {
        return new AllocArray(
            src,
            copyNode(node.lhs),
            copyNode(node.type),
            copyNode(node.size),
            copyNode(node.mem)
        ) as unknown as T;
    }

    if (node instanceof AllocStruct) {
        return new AllocStruct(
            src,
            copyNode(node.lhs),
            copyNode(node.type),
            copyNode(node.mem)
        ) as unknown as T;
    }

    if (node instanceof Assert) {
        return new Assert(src, copyNode(node.condition)) as unknown as T;
    }

    if (node instanceof Assignment) {
        return new Assignment(src, copyNode(node.lhs), copyNode(node.rhs)) as unknown as T;
    }

    if (node instanceof Branch) {
        return new Branch(
            src,
            copyNode(node.condition),
            node.trueLabel,
            node.falseLabel
        ) as unknown as T;
    }

    if (node instanceof FunctionCall) {
        return new FunctionCall(
            src,
            node.lhss.map(copyNode),
            copyNode(node.callee),
            node.memArgs.map(copyNode),
            node.typeArgs.map(copyNode),
            node.args.map(copyNode)
        ) as unknown as T;
    }

    if (node instanceof Jump) {
        return new Jump(src, node.label) as unknown as T;
    }

    if (node instanceof LoadField) {
        return new LoadField(
            src,
            copyNode(node.lhs),
            copyNode(node.baseExpr),
            node.member
        ) as unknown as T;
    }

    if (node instanceof LoadIndex) {
        return new LoadIndex(
            src,
            copyNode(node.lhs),
            copyNode(node.baseExpr),
            copyNode(node.indexExpr)
        ) as unknown as T;
    }

    if (node instanceof Return) {
        return new Return(src, node.values.map(copyNode)) as unknown as T;
    }

    if (node instanceof StoreField) {
        return new StoreField(
            src,
            copyNode(node.baseExpr),
            node.member,
            copyNode(node.rhs)
        ) as unknown as T;
    }

    if (node instanceof StoreIndex) {
        return new StoreIndex(
            src,
            copyNode(node.baseExpr),
            copyNode(node.indexExpr),
            copyNode(node.rhs)
        ) as unknown as T;
    }

    if (node instanceof TransactionCall) {
        return new TransactionCall(
            src,
            node.lhss.map(copyNode),
            copyNode(node.callee),
            node.memArgs.map(copyNode),
            node.typeArgs.map(copyNode),
            node.args.map(copyNode)
        ) as unknown as T;
    }

    if (node instanceof AllocMap) {
        return new AllocMap(
            src,
            copyNode(node.lhs),
            copyNode(node.type),
            copyNode(node.mem)
        ) as unknown as T;
    }

    if (node instanceof Contains) {
        return new Contains(
            src,
            copyNode(node.lhs),
            copyNode(node.baseExpr),
            copyNode(node.keyExpr)
        ) as unknown as T;
    }

    if (node instanceof IntType) {
        return new IntType(src, node.nbits, node.signed) as unknown as T;
    }

    if (node instanceof BoolType) {
        return new BoolType(src) as unknown as T;
    }

    if (node instanceof NeverType) {
        return new NeverType(src) as unknown as T;
    }

    if (node instanceof ArrayType) {
        return new ArrayType(src, copyNode(node.baseType)) as unknown as T;
    }

    if (node instanceof MapType) {
        return new MapType(src, copyNode(node.keyType), copyNode(node.valueType)) as unknown as T;
    }

    if (node instanceof PointerType) {
        return new PointerType(src, copyNode(node.toType), copyNode(node.region)) as unknown as T;
    }

    if (node instanceof UserDefinedType) {
        return new UserDefinedType(
            src,
            node.name,
            node.memArgs.map(copyNode),
            node.typeArgs.map(copyNode)
        ) as unknown as T;
    }

    if (node instanceof MemConstant) {
        return new MemConstant(src, node.name) as unknown as T;
    }

    if (node instanceof MemIdentifier) {
        return new MemIdentifier(src, node.name) as unknown as T;
    }

    if (node instanceof MemVariableDeclaration) {
        return new MemVariableDeclaration(src, node.name) as unknown as T;
    }

    if (node instanceof TypeVariableDeclaration) {
        return new TypeVariableDeclaration(src, node.name) as unknown as T;
    }

    if (node instanceof VariableDeclaration) {
        return new VariableDeclaration(src, node.name, copyNode(node.type)) as unknown as T;
    }

    if (node instanceof ArrayLiteral) {
        return new ArrayLiteral(src, node.values.map(copyNode)) as unknown as T;
    }

    if (node instanceof MapLiteral) {
        return new MapLiteral(
            src,
            node.values.map(([k, v]) => [copyNode(k), copyNode(v)])
        ) as unknown as T;
    }

    if (node instanceof StructLiteral) {
        return new StructLiteral(
            src,
            node.fields.map(([k, v]) => [k, copyNode(v)])
        ) as unknown as T;
    }

    if (node instanceof FunctionDefinition) {
        return new FunctionDefinition(
            src,
            node.memoryParameters.map(copyNode),
            node.typeParameters.map(copyNode),
            node.name,
            node.parameters.map(copyNode),
            node.locals.map(copyNode),
            node.returns.map(copyNode),
            node.body ? copyCfg(node.body) : undefined
        ) as unknown as T;
    }

    if (node instanceof StructDefinition) {
        return new StructDefinition(
            src,
            node.memoryParameters.map(copyNode),
            node.typeParameters.map(copyNode),
            node.name,
            node.fields.map(([k, v]) => [k, copyNode(v)])
        ) as unknown as T;
    }

    if (node instanceof GlobalVariable) {
        return new GlobalVariable(
            src,
            node.name,
            copyNode(node.type),
            copyNode(node.initialValue)
        ) as unknown as T;
    }

    throw new MIRCopyError(`Unable to copy node "${node.constructor.name}"`);
}

export function copy<T extends BaseSrc | CFG | Node>(input: T): T {
    if (input instanceof Node) {
        return copyNode(input) as unknown as T;
    }

    if (input instanceof BaseSrc) {
        return copySrc(input) as unknown as T;
    }

    return copyCfg(input) as unknown as T;
}
