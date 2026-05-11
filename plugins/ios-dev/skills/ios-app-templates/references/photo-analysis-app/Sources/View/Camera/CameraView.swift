//
//  CameraView.swift
//
//  Minimal SwiftUI camera screen: preview, tap-to-focus, capture button,
//  zoom slider, and a basic readout of the latest analysis result.
//
//  Extend this view in your app: add a navigation bar, history,
//  album integration, permission denial UI, etc.
//

import SwiftUI
import AVFoundation

struct CameraView: View {
    @State private var model = CameraModel()

    var body: some View {
        ZStack {
            // Live preview
            CameraPreview(previewLayer: model.previewLayer) { point in
                model.focus(at: point)
            }
            .ignoresSafeArea()

            // Focus indicator. `FocusIndicatorView` already applies
            // `.position(position)` internally, so do NOT wrap it with
            // another `.position(point)` modifier — that would double up
            // the positioning and end up at the wrong place.
            if model.isFocusing, let point = model.focusPoint {
                FocusIndicatorView.focusing(at: point)
                    .allowsHitTesting(false)
            }

            VStack {
                Spacer()
                // Latest analysis (text overlay)
                if let result = model.analysisResult, !result.llmResponse.isEmpty {
                    Text(result.llmResponse)
                        .font(.callout)
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                }

                // Zoom slider
                HStack {
                    Image(systemName: "minus.magnifyingglass")
                    Slider(
                        value: Binding(
                            get: { Double(model.zoomFactor) },
                            set: { newValue in
                                model.zoom(by: Float(newValue) - model.zoomFactor)
                            }
                        ),
                        in: 1.0...6.0
                    )
                    Image(systemName: "plus.magnifyingglass")
                }
                .padding(.horizontal, 24)

                // Capture button
                Button {
                    Task { await model.capturePhoto() }
                } label: {
                    Circle()
                        .fill(model.captureActivity.isCapturing ? .gray : .white)
                        .frame(width: 72, height: 72)
                        .overlay(
                            Circle()
                                .stroke(.white, lineWidth: 4)
                                .frame(width: 82, height: 82)
                        )
                }
                .disabled(model.captureActivity.isCapturing)
                .padding(.bottom, 32)
            }
        }
        .task {
            await model.start()
        }
        .onDisappear {
            model.stop()
        }
        .alert("Camera error",
               isPresented: Binding(
                get: { model.error != nil },
                set: { if !$0 { model.error = nil } }
               ),
               presenting: model.error) { _ in
            Button("OK", role: .cancel) { model.error = nil }
        } message: { error in
            Text(error.localizedDescription)
        }
    }
}

#Preview {
    CameraView()
}
