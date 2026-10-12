import Foundation
import Vision

struct Input: Decodable {
  let id: String
  let path: String
}

struct Label: Encodable {
  let name: String
  let confidence: Float
}

struct Output: Encodable {
  let id: String
  let labels: [Label]
  let error: String?
}

let decoder = JSONDecoder()
let encoder = JSONEncoder()

while let line = readLine() {
  guard let data = line.data(using: .utf8),
        let input = try? decoder.decode(Input.self, from: data) else {
    continue
  }

  do {
    let request = VNClassifyImageRequest()
    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .accurate
    textRequest.usesLanguageCorrection = false
    textRequest.recognitionLanguages = ["en-US", "zh-Hans", "zh-Hant"]
    textRequest.minimumTextHeight = 0.01
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: input.path))
    try handler.perform([request, textRequest])
    var labels = (request.results ?? []).prefix(12).map {
      Label(name: $0.identifier, confidence: $0.confidence)
    }
    let text = (textRequest.results ?? []).filter { $0.confidence >= 0.15 }
    let textArea = text.reduce(Float(0)) { total, observation in
      total + Float(observation.boundingBox.width * observation.boundingBox.height)
    }
    if text.count >= 2 || textArea >= 0.025 {
      labels.append(Label(name: "text_heavy", confidence: text.count >= 3 || textArea >= 0.10 ? 0.9 : 0.6))
    }
    let output = Output(id: input.id, labels: labels, error: nil)
    print(String(data: try encoder.encode(output), encoding: .utf8)!)
  } catch {
    let output = Output(id: input.id, labels: [], error: String(describing: error))
    print(String(data: try encoder.encode(output), encoding: .utf8)!)
  }
}
