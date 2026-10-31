import CoreTransferable
import UniformTypeIdentifiers

/// Private drag data keeps ordinary text/file drops out of session ordering.
struct OpenSessionDrag: Codable, Transferable {
    let windowID: UUID
    let sessionID: UUID

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: UTType(exportedAs: "com.fine.open-session", conformingTo: .data))
    }
}

/// 행에 떨어뜨린 자리. 위·아래 가장자리는 그 사이에 끼우고, 가운데는 그 행 아래로 묶는다.
enum SessionInsertionEdge { case before, after, nest }
