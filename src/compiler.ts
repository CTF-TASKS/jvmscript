import { createSourceFile, ScriptTarget, SyntaxKind, VariableStatement, Node, Identifier, StringLiteral, NumericLiteral } from 'typescript'
import { readFile as readFileAsync } from 'fs'
import { equal } from 'assert'
import { promisify } from 'util'
const readFile = promisify(readFileAsync)

enum ConstantKind {
  TAG_CLASS = 7,
  TAG_FIELD_REF = 9,
  TAG_METHOD_REF = 10,
  TAG_INTERFACE_METHOD_REF = 11,
  TAG_STRING = 8,
  TAG_INTEGER = 3,
  TAG_FLOAT = 4,
  TAG_LONG = 5,
  TAG_DOUBLE = 6,
  TAG_NAME_AND_TYPE = 12,
  TAG_UTF8 = 1,
  TAG_METHOD_HANDLE = 15,
  TAG_METHOD_TYPE = 16,
  TAG_INVOKE_DYNAMIC = 18,
}

type Constant = {
  kind: ConstantKind.TAG_UTF8
  str: string
} | {
  kind: ConstantKind.TAG_DOUBLE
  num: number
} | {
  kind: ConstantKind.TAG_CLASS
  name_index: number
} | {
  kind: ConstantKind.TAG_METHOD_REF
  class_index: number
  name_and_type_index: number
} | {
  kind: ConstantKind.TAG_NAME_AND_TYPE
  name_index: number
  description_index: number
}
class ConstantPool {
  pool: Constant[] = []
  constructor () {}
  addString(str: string) {
    this.pool.push({
      kind: ConstantKind.TAG_UTF8,
      str
    })
    return this.pool.length
  }
  addNumber(num: number) {
    this.pool.push({
      kind: ConstantKind.TAG_DOUBLE,
      num
    })
    return this.pool.length
  }
  addClass(name_index: number) {
    this.pool.push({
      kind: ConstantKind.TAG_CLASS,
      name_index
    })
    return this.pool.length
  }
  addMethodRef(class_index: number, name_and_type_index: number) {
    this.pool.push({
      kind: ConstantKind.TAG_METHOD_REF,
      class_index,
      name_and_type_index
    })
    return this.pool.length
  }
  addNameAndType(name_index: number, description_index: number) {
    this.pool.push({
      kind: ConstantKind.TAG_NAME_AND_TYPE,
      name_index,
      description_index
    })
    return this.pool.length
  }
  write(buffer: Buffer, offset: number = 8) {
    offset = buffer.writeInt16BE(this.pool.length + 2, offset)
    for (const c of this.pool) {
      offset = buffer.writeInt8(c.kind, offset)
      switch (c.kind) {
        case ConstantKind.TAG_UTF8:
          offset = buffer.writeInt16BE(c.str.length, offset)
          offset += buffer.write(c.str, offset, 'utf8')
          break
        case ConstantKind.TAG_DOUBLE:
          offset = buffer.writeDoubleBE(c.num, offset)
          break
        case ConstantKind.TAG_CLASS:
          offset = buffer.writeInt16BE(c.name_index, offset)
          break
        case ConstantKind.TAG_METHOD_REF:
          offset = buffer.writeInt16BE(c.class_index, offset)
          offset = buffer.writeInt16BE(c.name_and_type_index, offset)
          break
        case ConstantKind.TAG_NAME_AND_TYPE:
          offset = buffer.writeInt16BE(c.name_index, offset)
          offset = buffer.writeInt16BE(c.description_index, offset)
          break
        default:
          // @ts-ignore
          throw new TypeError(`ConstantKind: ${c.kind} is not supported`)
      }
    }

    return offset
  }
}

class ClassInfo {
  pool = new ConstantPool()
  thisClass = 'Main'
  superClass = 'java/lang/Object'
  constructor() {}
  write(buffer: Buffer) {
    const thisClass = this.pool.addClass(this.pool.addString(this.thisClass))
    const superClass = this.pool.addClass(this.pool.addString(this.superClass))

    let offset = 0
    offset = buffer.writeUInt32BE(0xcafebabe, offset)
    offset = buffer.writeInt16BE(0, offset)
    offset = buffer.writeInt16BE(58, offset)
    offset = this.pool.write(buffer, offset)
    offset = buffer.writeInt16BE(0x21, offset) // access flags: SUPER,PUBLIC
    offset = buffer.writeInt16BE(thisClass, offset) // this class
    offset = buffer.writeInt16BE(superClass, offset) // super class
    offset = buffer.writeInt16BE(0, offset) // interface count
    offset = buffer.writeInt16BE(0, offset) // fields count
    offset = buffer.writeInt16BE(0, offset) // methods count
    // methods
    offset = buffer.writeInt16BE(0, offset) // attr count

    return offset
  }
}

function getLiteral(node?: Node) {
  if (typeof node === 'undefined') throw new TypeError('Variable must be initialized')
  if (node.kind === SyntaxKind.StringLiteral) {
    return (node as StringLiteral).text
  } else if (node.kind === SyntaxKind.NumericLiteral) {
    return parseFloat((node as NumericLiteral).text)
  } else {
    throw new TypeError(`Initializer ${node.kind} is not supported`)
  }
}

export function compile(source: string) {
  const sourceFile = createSourceFile('main.ts', source, ScriptTarget.ES2020)
  const cls = new ClassInfo()
  const varConst = new Map()

  for (const i of sourceFile.statements) {
    if (i.kind === SyntaxKind.VariableStatement) {
      const s = i as VariableStatement
      equal(s.declarationList.kind, SyntaxKind.VariableDeclarationList)
      for (const decl of s.declarationList.declarations) {
        equal(decl.kind, SyntaxKind.VariableDeclaration)
        equal(decl.name.kind, SyntaxKind.Identifier)
        const name = (decl.name as Identifier).escapedText
        const value = getLiteral(decl.initializer)

        console.log('decl', name, value)

        let id: number
        if (typeof value === 'number') {
          id = cls.pool.addNumber(value)
        } else {
          id = cls.pool.addString(value)
        }
        varConst.set(name, id)
      }
    }
  }
  return cls
}
