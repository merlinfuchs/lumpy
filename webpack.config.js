const path = require("path");
const HTMLPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin")
const pdfWorkerPath = path.join(
    __dirname,
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"
);

module.exports = {
    entry: {
        options: "./src/options/options.tsx",
        content: "./src/content/content.tsx",
        background: "./src/background/background.ts",
    },
    mode: "production",
    module: {
        rules: [
            {
                test: /\.mjs$/,
                include: /node_modules/,
                type: "javascript/auto",
            },
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: { noEmit: false },
                        }
                    }],
                exclude: /node_modules/,
            },
            {
                exclude: /node_modules/,
                test: /\.css$/i,
                oneOf: [
                    // For the content script, we inject styles into a ShadowRoot manually.
                    // Export compiled CSS as a string instead of auto-injecting into <head>.
                    {
                        resource: /src\/content\/content\.css$/i,
                        use: [
                            {
                                loader: "css-loader",
                                options: {
                                    exportType: "string",
                                },
                            },
                            "postcss-loader",
                        ],
                    },
                    // Default: inject CSS into the document <head> (extension pages).
                    {
                        use: ["style-loader", "css-loader", "postcss-loader"],
                    },
                ],
            },
            {
                test: /\.(svg|png|ico|gif|jpe?g|webp)$/i,
                type: "asset/resource",
            },
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "manifest.json", to: "../manifest.json" },
                { from: pdfWorkerPath, to: "pdf.worker.min.mjs" },
            ],
        }),
        ...getHtmlPlugins(["options"]),
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".js", ".mjs"],
    },
    output: {
        path: path.join(__dirname, "dist/js"),
        filename: "[name].js",
    },
};

function getHtmlPlugins(chunks) {
    return chunks.map(
        (chunk) =>
            new HTMLPlugin({
                title: "React extension",
                filename: `${chunk}.html`,
                chunks: [chunk],
            })
    );
}