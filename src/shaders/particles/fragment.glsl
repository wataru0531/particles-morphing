
precision lowp float;


varying vec3 vColor;

void main(){
	vec2 uv = gl_PointCoord;

	// ✅ 今描画しているピクセルが、粒子の中心からどれだけ離れているかを計算
	float distanceToCenter = length(uv - 0.5); // 中央からの距離。おおよそ0.0〜0.7
																							// ⭐️ 実際には0ではなくかなり小さい数値らしい
	float alpha = (0.05 / distanceToCenter) - 0.1; // 中心が明るく、端が暗く
	// float alpha = clamp((0.05 / distanceToCenter) - 0.1, 0., 1.); // 0から1に丸める

	gl_FragColor = vec4(vColor, alpha);

	#include <tonemapping_fragment> // トーンマッピング。明るさの見え方を調整する。
	#include <colorspace_fragment>  // 色空間を変換し、画面で適切に見えるようにする。
}


// ✅ gl_PointCoord
// 1つのポイント（粒子）が描かれるときの その四角形（スプライト）のUV座標
// 左下が (0,0)
// 右上が (1,1)
// 中心が (0.5, 0.5)
// つまり、粒子1つを「小さなテクスチャのような四角」として描くときの座標になる。