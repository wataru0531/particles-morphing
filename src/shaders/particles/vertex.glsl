
precision lowp float;

uniform vec2 uResolution; // ビューポートの倍の大きさ 1800 2152
uniform float uSize; // 0.4。全体的な粒子サイズをコントロールするスケール係数
uniform float uProgress;
uniform vec3 uColorA; // オレンジ
uniform vec3 uColorB; // 青

attribute vec3 aPositionTarget; // ✅ 次のモーフィングの頂点。動的に変わる。x,y,zの頂点
attribute float aSize; // 各頂点ごとの「個別のサイズ係数」。10242つ。ランダムな 0 〜 1の少数

varying vec3 vColor;

#include ../includes/simplexNoise3d.glsl

void main(){
	// Mixed position
	// simplexノイズ　→ -1 〜 1の範囲で返す。
	float noiseOrigin = simplexNoise3d(position * 0.2); // 元の頂点 -.2 〜 .2 の範囲に
	float noiseTarget = simplexNoise3d(aPositionTarget * 0.2); // 移動後の頂点
	float noise = mix(noiseOrigin, noiseTarget, uProgress);
	noise = smoothstep(-1.0, 1.0, noise); // noise < -1 なら0を返す。1 < noise なら1を返す。
																				// その間はゆっくり線形補間で返す。
																				// 👉 0 〜 1に 正規化している。
																				//    元々が-0.2 〜 0.2の範囲で返していたが、
																				//    ここでは、0.3 〜 0.7 くらいのの範囲で返す
																				// x=-1        0         +1   (変換前)
																				// |-----------|-----------|
																				// 0          0.5          1 (変換後)

	// ✅ アニメーションを頂点ごとに時間的にずらしていく
	// → 単なる0〜1なら味気ないので、noiseにより遅延を異らせる。
	float duration = 0.4; // 全体(0〜1)のうち、40％の時間だけ動くという意味。
												// 残りの60％ → 動いていない時間(遅延や余白)として使われる
	// 頂点ごとの動き始めのタイミング(遅れ)を作る 
	float delay = (1.0 - duration) * noise; // 0.6 * noise(0.3〜0.7)。 0.18〜0.42 の範囲
																					// → 
	// 遅延時間 + 動かす時間 ... その頂点が動き終わる時間
	float end = delay + duration; // (0.18 〜 0.7) + 0.4。 0.58 〜 0.82 の範囲
	float progress = smoothstep(delay, end, uProgress); // 0.18 〜 0.82 を 0〜1の範囲に正規化
																											// delay → いつ動き始めるか（開始時刻）
																											// end → いつ動き終わるか（終了時刻）
																											// 仮に0.18から0.82の範囲内だけで動く
																											// → それを0から1にマッピング

	vec3 mixedPosition = mix(position, aPositionTarget, progress); 
	

	// Final position
	vec4 modelPosition = modelMatrix * vec4(mixedPosition, 1.0); // ワールド座標に変換
	vec4 viewPosition = viewMatrix * modelPosition; // 視点座標に変換
																									// 視点座標が(0, 0)の位置になるので、
																									// そこから見たらモデルの位置はマイナスに置き換わる
	vec4 projectedPosition = projectionMatrix * viewPosition;
	gl_Position = projectedPosition;

	// ✅ ポイントのサイズ
	gl_PointSize = aSize * uSize * uResolution.y; // ランダムな0〜1 * 0.4 * ビューポートの2倍のサイズ
	gl_PointSize *= (1.0 / - viewPosition.z); // camera.position → 24
																						// 視点座標から見たモデルなのでマイナス。マイナスをかけてプラスにする
																						// 👉 遠ければ粒子が小さくなり、近ければ大きくなる

	vColor = mix(uColorA, uColorB, noise); // noiseはおおよそ0.3から0.7
																				 // → ここではmixで線形に色を変えている
}




