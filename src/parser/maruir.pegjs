Program
    = (d: Definition __ { return d; })*;

/// Definitions

Definition
    = StructDefinition
    / FunctionDefinition;


MemoryFormalParams
    = LBRACKET __ mVars: IdList __ RBRACKET { return mVars; }

StructField
    = name: Identifier __ COLON __ type: Type __ SEMICOLON { return [name, type]; }

StructDefinition
    = STRUCT __ mArgs: MemoryFormalParams? __ name: Identifier __ LCBRACE __ fields: (f: StructField __ { return f; })* __ RCBRACE {
        return new StructDefinition<SrcRange>(
            Src.fromPegsRange(location()),
            mArgs === null ? [] : mArgs,
            name,
            fields === null ? [] : fields);
    }

VariableDecl
    = name: Identifier __ COLON __ typ: Type {
        return new VariableDeclaration(Src.fromPegsRange(location()), name, typ);
    }

FunctionParameters
    = head: VariableDecl
      tail: (__ COMMA __ d: VariableDecl { return d; })* {
        return [head, ...tail];
      }

FunBody
    = LCBRACE __ stmts: (stmt: (LabeledStatement / Statement) __ { return stmt; })* RCBRACE {
        return buildCFG(stmts, options as ParseOptions, location());
    }

FunctionDefinition
    = FUNCTION __ mArgs: MemoryFormalParams? __ name: Identifier __  LPAREN __ params: FunctionParameters? __ RPAREN rets: (__ COLON __ retT: Type { return retT; })? __ locals: (LOCALS __ p: FunctionParameters __ SEMICOLON { return p; })? __ body: FunBody? {
        return new FunctionDefinition(
            Src.fromPegsRange(location()),
            mArgs === null ? [] : mArgs,
            name,
            params === null ? [] : params,
            locals === null ? [] : locals,
            rets === null ? [] : [rets],
            body === null ? undefined : body);
    }

IdList
    = head: Identifier tail: (__ COMMA __ id: Identifier {return id;})* {
        return [head, ...tail];
    }

/// Types
TypeArgs
    = head: Type tail: (__ COMMA __ typ: Type { return typ; })* { return [head, ...tail]; }

UserDefinedType
    = name: Identifier memArgs: (LBRACKET __  ids: IdList __ RBRACKET { return ids; })? typeArgs: (LT __ types:TypeArgs __ GT { return types; })? {
        return new UserDefinedType(Src.fromPegsRange(location()), name, memArgs === null ? [] : memArgs, typeArgs === null ? [] : typeArgs);
    }

PrimitiveType
    = IntType
    / BOOL { return new BoolType(Src.fromPegsRange(location())); }
    / UserDefinedType
    / LPAREN innerT: Type RPAREN { return innerT; }

IntType
    = unsigned:("u"?) "int" nbits:([0-9]+ {return Number(text())})  { return new IntType(Src.fromPegsRange(location()), nbits, unsigned == null); }

PointerOrArrayType
    = head: PrimitiveType tail: ((__ STAR __ Identifier) / __ LBRACKET __ RBRACKET)* {
        return tail.reduce(
            (acc: Type, el: any) => {
                if (el[1] === "*") {
                    return new PointerType(Src.fromPegsRange(location()), acc, el[3]);
                } else {
                    return new ArrayType(Src.fromPegsRange(location()), acc);
                }
            },
            head
        )
    }

Type = PointerOrArrayType

/// Statements

LabeledStatement
    = label: Identifier __ COLON __ stmt: Statement { return [label, stmt]; }

Statement
    = Assignment
    / Branch
    / LoadIndex
    / LoadField
    / StoreIndex
    / StoreField
    / Jump
    / Return

Assignment
    = lhs: Identifier __ ":=" __ rhs: Expression __ SEMICOLON {
        const lhsNode = new Identifier(Src.fromPegsRange(location()), lhs);
        return new Assignment(Src.fromPegsRange(location()), lhsNode, rhs);
    }

Branch
    = BRANCH __ condition: Expression __ trueLabel: Identifier __ falseLabel: Identifier __ SEMICOLON {
        return new Branch(Src.fromPegsRange(location()), condition, trueLabel, falseLabel);
    }

LoadIndex
    = LOAD __ base: Expression __ LBRACKET __ index: Expression __ RBRACKET IN lhs: Identifier __ SEMICOLON {
        const lhsNode = new Identifier(Src.fromPegsRange(location()), lhs);
        return new LoadIndex(Src.fromPegsRange(location()), lhsNode, base, index);
    }

LoadField
    = LOAD __ base: Expression "." member: Identifier IN lhs: Identifier __ SEMICOLON {
        const lhsNode = new Identifier(Src.fromPegsRange(location()), lhs);
        return new LoadField(Src.fromPegsRange(location()), lhsNode, base, member);
    }

StoreIndex
    = STORE __ rhs: Expression __ IN __ base: Expression __ LBRACKET __ index: Expression __ RBRACKET __ SEMICOLON {
        return new StoreIndex(Src.fromPegsRange(location()), base, index, rhs);
    }

StoreField
    = STORE __ rhs: Expression __ IN __ base: Expression "." member: Identifier  __ SEMICOLON {
        return new LoadField(Src.fromPegsRange(location()), base, member, rhs);
    }

Jump
    = JUMP  __ label: Identifier __ SEMICOLON {
        return new Jump(Src.fromPegsRange(location()), label);
    }

ExprList
    = head: Expression
      tail: (__ COMMA __ e: Expression { return e; })* {
        return [head, ...tail];
      }

Return
    = RETURN __ values: (Expression / (LPAREN __ exprs: ExprList __ RPAREN { return exprs; }))? __ SEMICOLON {
        const vs = values === null ? [] : values instanceof Expression ? [values] : values;
        return new Return(Src.fromPegsRange(location()), vs);
    }

/// Expressions
HexDigit =
    [0-9a-f]i

HexNumber =
    "0x"i digits: HexDigit+ {
        return [BigInt(text()), 16]
    }

DecDigit =
    [0-9]

DecNumber =
    DecDigit+ {
        return [BigInt(text()), 10];
    }

NumberLiteral =
    type: IntType __ LPAREN __ value: (HexNumber / DecNumber) __ RPAREN {
        return new NumberLiteral(Src.fromPegsRange(location()), value[0], value[1], type);
    }

BooleanLiteral =
    val: (TRUE / FALSE) {
        return new BooleanLiteral(Src.fromPegsRange(location()), val === "true");
    }

Literal
    = NumberLiteral
    / BooleanLiteral

PrimitiveExpression
    = Literal
    / (id: Identifier { return new Identifier(Src.fromPegsRange(location()), id); })
    / LPAREN __ e: Expression __ RPAREN { return e; }

UnaryExpression =
    (
        operator: UnaryOperator __ subexp: UnaryExpression {
            return new UnaryOperation(Src.fromPegsRange(location()), operator, subexp);
        }
    )
    / PrimitiveExpression

UnaryOperator =
    "-"
    / "!"

PowerExpression =
    head: UnaryExpression
    tail: (__ op: "**" __ e: UnaryExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

MultiplicativeOperator =
    $("*") { return text() as MultiplicativeBinaryOperator; }
    / $("/") { return text() as MultiplicativeBinaryOperator; }
    / $("%") { return text() as MultiplicativeBinaryOperator; }

MultiplicativeExpression =
    head: PowerExpression
    tail: (__ op: MultiplicativeOperator __ e: PowerExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

AdditiveOperator =
    $("+") { return text() as AdditiveBinaryOperator; }
    / $("-") { return text() as AdditiveBinaryOperator; }

AdditiveExpression =
    head: MultiplicativeExpression
    tail: (__ op: AdditiveOperator __ e: MultiplicativeExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

ShiftExpression =
    head: AdditiveExpression
    tail: (__ op: ShiftOperator __ e: AdditiveExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

ShiftOperator =
    $("<<") { return text() as ShiftBinaryOperator; }
    / $(">>") { return text() as ShiftBinaryOperator; }

BitwiseANDExpression =
    head: ShiftExpression
    tail: (__ op: "&" __ e: ShiftExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

BitwiseXORExpression =
    head: BitwiseANDExpression
    tail: (__ op: "^" __ e: BitwiseANDExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

BitwiseORExpression =
    head: BitwiseXORExpression
    tail: (__ op: "|" __ e: BitwiseXORExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

RelationalExpression =
    (
        left: BitwiseORExpression __ op: RelationalOperator __ right: BitwiseORExpression {
            return new BinaryOperation(Src.fromPegsRange(location()), left, op, right);
        }
    )
    / BitwiseORExpression

RelationalOperator =
    '<=' { return text(); }
    / '>=' { return text(); }
    / '<' { return text(); }
    / '>' { return text(); }

EqualityExpression =
    (
        left: BitwiseORExpression __ op: EqualityOperator __ right: BitwiseORExpression {
            return new BinaryOperation(Src.fromPegsRange(location()), left, op, right);
        }
    )
    / RelationalExpression

EqualityOperator =
    "==" { return text(); }
    / "!=" { return text(); }

LogicalANDExpression =
    head: EqualityExpression
    tail: (__ op: "&&" __ e: EqualityExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }

LogicalORExpression =
    head: LogicalANDExpression
    tail: (__ op: "||" __ e: LogicalANDExpression { return [op, e, location()]; })* {
        return buildBinaryExpression(head, tail, location(), options as ParseOptions);
    }


Expression = LogicalORExpression 

/// Misc

// Keywords
STRUCT = "struct"
FUNCTION = "fun"
LCBRACE = "{"
RCBRACE = "}"
LPAREN = "("
RPAREN = ")"
LBRACKET = "["
RBRACKET = "]"
COLON = ":"
BOOL = "bool"
SEMICOLON = ";"
LT = "<"
GT = ">"
COMMA = ","
STAR = "*"
TRUE="true"
FALSE="false"
BRANCH="branch"
JUMP="jump"
RETURN="return"
LOAD="load"
STORE="store"
IN="in"
LOCALS="locals"

Keyword
    = STRUCT
    / FUNCTION
    / BOOL
    / TRUE
    / FALSE
    / BRANCH
    / LOAD
    / STORE 
    / IN
    / JUMP
    / RETURN
    / LOCALS

Identifier =
    !(Keyword ![a-zA-Z0-9_]) id:([a-zA-Z_][a-zA-Z0-9_]*) { return text(); }
// Whitespace

PrimitiveWhiteSpace =
    "\t"
    / "\v"
    / "\f"
    / " "
    / "\u00A0"
    / "\uFEFF"
    / Zs

WhiteSpace "whitespace" =
    PrimitiveWhiteSpace
    / LineTerminator PrimitiveWhiteSpace* ("*" / "///")

// Separator, Space

Zs =
    [\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]

LineTerminator =
    [\n\r\u2028\u2029]

LineTerminatorSequence =
    "\n"
    / "\r\n"
    / "\r"
    / "\u2028"
    / "\u2029"

__ =
    (WhiteSpace / LineTerminator)*