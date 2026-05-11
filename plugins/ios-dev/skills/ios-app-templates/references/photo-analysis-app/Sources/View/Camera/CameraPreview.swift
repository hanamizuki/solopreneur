//
//  CameraPreview.swift
//
//  UIViewRepresentable wrapper around AVCaptureVideoPreviewLayer with an
//  optional tap callback (used for tap-to-focus).
//

import SwiftUI
import AVFoundation

struct CameraPreview: UIViewRepresentable {
    let previewLayer: AVCaptureVideoPreviewLayer
    /// Tap callback. Receives the tap location in view-local coordinates.
    let onTap: ((CGPoint) -> Void)?

    init(previewLayer: AVCaptureVideoPreviewLayer, onTap: ((CGPoint) -> Void)? = nil) {
        self.previewLayer = previewLayer
        self.onTap = onTap
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.layer.addSublayer(previewLayer)
        view.onTap = onTap
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        // `updateUIView` already runs on the main thread, so the previous
        // \`DispatchQueue.main.async\` only deferred the frame update by one
        // runloop, racing with \`PreviewView.layoutSubviews\` (which also
        // sizes the sublayer). Set the frame inline.
        previewLayer.frame = uiView.bounds
        uiView.onTap = onTap
    }
}

final class PreviewView: UIView {
    var onTap: ((CGPoint) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupTapGesture()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupTapGesture()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.sublayers?.first?.frame = bounds
    }

    private func setupTapGesture() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.numberOfTapsRequired = 1
        tap.numberOfTouchesRequired = 1
        addGestureRecognizer(tap)
        isUserInteractionEnabled = true
        Log.ui.info("Camera preview tap gesture installed")
    }

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: self)
        Log.ui.debug("Preview tap location=\(String(describing: location)) bounds=\(String(describing: self.bounds.size))")
        guard bounds.contains(location) else {
            Log.ui.notice("Tap outside preview bounds; ignoring")
            return
        }
        onTap?(location)
    }
}
