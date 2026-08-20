// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GgbLineLogin",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "GgbLineLogin",
            targets: ["LineLoginPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // LINE 官方 iOS SDK（app-to-app 授權）。
        // ⚠️ 鎖 5.11.x：5.17 用了 Swift 6 的並行語法，Xcode 15.4（Swift 5.10）
        // 編不過（ApplicationOpener／@MainActor 那批錯誤）。等這台升 Xcode 26
        // 再解鎖到最新版。
        .package(url: "https://github.com/line/line-sdk-ios-swift.git", exact: "5.11.2")
    ],
    targets: [
        .target(
            name: "LineLoginPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "LineSDK", package: "line-sdk-ios-swift")
            ],
            path: "ios/Sources/LineLoginPlugin")
    ]
)
