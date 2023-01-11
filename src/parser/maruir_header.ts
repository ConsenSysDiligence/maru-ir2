import {
    Definition,
    StructDefinition,
    IntType,
    BoolType,
    UserDefinedType,
    PointerType,
    ArrayType,
    FunctionDefinition,
    NumberLiteral,
    BooleanLiteral,
    Identifier,
    UnaryOperation,
    Expression,
    BinaryOperator,
    BinaryOperation,
    Assignment,
    LoadField,
    LoadIndex,
    StoreField,
    StoreIndex,
    Branch,
    Return,
    Statement,
    TerminatorStmt,
    Jump,
    VariableDeclaration,
    MemVariableDeclaration,
    TypeVariableDeclaration,
    PegsRange,
    noSrc,
    Src,
    BaseSrc,
    MemConstant,
    FunctionCall,
    TransactionCall,
    Abort,
    Node,
    Type,
    MemDesc,
    AllocArray,
    AllocStruct,
    Assert,
    MemIdentifier,
    Cast
} from "../ir";
import { BasicBlock, CFG } from "../ir/cfg";
import { MIRSyntaxError } from "../utils";

// @ts-ignore
export function parseSource(source: string, options: ParseOptions) {
    try {
        // @ts-ignore
        return parse(source, options);
    } catch (e) {
        // @ts-ignore
        if (e instanceof PeggySyntaxError) {
            throw new MIRSyntaxError(Src.fromPegsRange(e.location), e.message);
        }

        throw e;
    }
}

export function parseProgram(source: string): Definition[] {
    return parseSource(source, { startRule: "Program" });
}

export function parseStatement(source: string): Expression {
    return parseSource(source, { startRule: "Statement" });
}

function buildBinaryExpression(
    head: Expression,
    tail: Array<[BinaryOperator, Expression, PegsRange]>,
    src: PegsRange
): Node {
    return tail.reduce((acc, [curOp, curVal, curLoc]) => {
        const loc = new Src(src.start, curLoc.end);

        return new BinaryOperation(loc, acc, curOp, curVal);
    }, head);
}

/**
 * Build a `CFG` from a list of raw `Statement`s or pairs `[label, Statement]`
 * parsed from a source file.
 */
export function buildCFG(
    rawStmts: Array<Statement | [string, Statement]>,
    rawBodyLoc: PegsRange
): CFG {
    const bodyLoc = Src.fromPegsRange(rawBodyLoc);

    let entry: BasicBlock | undefined;

    // For empty functions build a CFG with a single empty BB
    if (rawStmts.length === 0) {
        entry = new BasicBlock("entry", [new Return(bodyLoc, [])]);

        return new CFG([entry], entry, [entry]);
    }

    const nodes: BasicBlock[] = [];
    const exits: BasicBlock[] = [];

    let curStmts: Statement[] = [];
    let curLabel: string | undefined;

    const firstStmt = rawStmts[0];

    // We require all functions to start with a label.
    if (firstStmt instanceof Statement) {
        throw new MIRSyntaxError(
            firstStmt.src,
            "Expected first statement in function to be labeled."
        );
    }

    const bbMap = new Map(nodes.map((n) => [n.label, n]));
    const addBB = () => {
        const newBB = new BasicBlock(curLabel as string, curStmts);

        if (bbMap.has(curLabel as string)) {
            throw new MIRSyntaxError(curStmts[0].src, `Duplicate basic block label ${curLabel}`)
        }

        if (entry === undefined) {
            entry = newBB;
        }

        bbMap.set(newBB.label, newBB);
        nodes.push(newBB);
    };

    // First split the list of statements into basic blocks
    for (const el of rawStmts) {
        if (el instanceof Statement) {
            curStmts.push(el);
        } else {
            if (curLabel !== undefined) {
                addBB();
            }

            curLabel = el[0];
            curStmts = [el[1]];
        }
    }

    // Add last BB
    addBB();

    // Find edges
    const getBB = (label: string, loc: BaseSrc): BasicBlock => {
        const res = bbMap.get(label);

        if (res === undefined) {
            throw new MIRSyntaxError(loc, `Unknown label ${label}`);
        }

        return res;
    };

    for (let i = 0; i < nodes.length; i++) {
        const bb = nodes[i];

        // This should be disallowed by the grammar
        if (bb.statements.length === 0) {
            throw new Error(`Unexpected error: Found empty basic block.`);
        }

        const lastStmt = bb.statements[bb.statements.length - 1];

        if (!(lastStmt instanceof TerminatorStmt)) {
            throw new MIRSyntaxError(
                lastStmt.src,
                `Found basic block that ends in non-terminator statement ${lastStmt.pp()}.`
            );
        }

        if (lastStmt instanceof Return || lastStmt instanceof Abort) {
            exits.push(bb);

            continue;
        }

        if (lastStmt instanceof Branch) {
            const trueBB = getBB(lastStmt.trueLabel, lastStmt.src);
            const falseBB = getBB(lastStmt.falseLabel, lastStmt.src);

            bb.addOutgoing(trueBB, lastStmt.condition);
            bb.addOutgoing(
                falseBB,
                new UnaryOperation(lastStmt.condition.src, "!", lastStmt.condition)
            );

            continue;
        }

        if (lastStmt instanceof Jump) {
            const destBB = getBB(lastStmt.label, lastStmt.src);

            bb.addOutgoing(destBB, new BooleanLiteral(noSrc, true));

            continue;
        }

        throw new Error(`Unknown terminator statement ${lastStmt.pp()}`);
    }

    if (entry === undefined) {
        throw new Error("Missing entry block");
    }

    return new CFG(nodes, entry, exits);
}
