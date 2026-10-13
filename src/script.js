
import {
	Scene,
	PerspectiveCamera,
	WebGLRenderer,
	Float32BufferAttribute,
	BufferGeometry,
	BufferAttribute,
	ShaderMaterial,
	Uniform,
	AdditiveBlending,
	Points,
	Vector2,
	Color,

} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import GUI from 'lil-gui'
import gsap from 'gsap'
import particlesVertexShader from './shaders/particles/vertex.glsl'
import particlesFragmentShader from './shaders/particles/fragment.glsl'

const gui = new GUI({ width: 340 });
const debugObject = {}

const canvas = document.querySelector('canvas.webgl');
const scene = new Scene();

// ✅ Draco
// GLTF/GLBファイルのメッシュデータ(頂点座標や法線など)を圧縮して、ファイルサイズを小さくするためのフォーマット。
// 圧縮されたデータはそのままでは Three.js が使えないので、DRACOLoaderでデコードする必要がある。
// → dracoフォルダに draco_decoder.js や draco_decoder.wasm がある必要がある
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');

// ✅ gltfLoader
// → GLTFLoader は通常の GLTF/GLB を読み込むが、モデル内のメッシュが 
//   Draco 圧縮されている場合、DRACOLoader を使って自動で展開できるように設定する
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
// → glftローダーに設定する

const sizes = {
	width: window.innerWidth,
	height: window.innerHeight,
	pixelRatio: Math.min(window.devicePixelRatio, 2)
}

// ✅ リサイズ
window.addEventListener('resize', () => {
	sizes.width = window.innerWidth
	sizes.height = window.innerHeight
	sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

	if(particles)
		particles.material.uniforms.uResolution.value.set(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)

	camera.aspect = sizes.width / sizes.height
	camera.updateProjectionMatrix()
	renderer.setSize(sizes.width, sizes.height)
	renderer.setPixelRatio(sizes.pixelRatio)
});

// ✅ camera
const camera = new PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 0, 8 * 4);
scene.add(camera);

// ✅ Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true

// ✅ renderer
const renderer = new WebGLRenderer({
	canvas: canvas,
	antialias: true,
});

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);
renderer.setClearColor("#160920");

debugObject.clearColor = '#160920'
gui.addColor(debugObject, 'clearColor').onChange(() => { renderer.setClearColor(debugObject.clearColor) })

// ✅ particles
let particles = null;

// ⭐️ GLBファイルから読み込んだ3Dモデルの頂点情報を使って、パーティクルアニメーションを生成する
// → 3Dモデルを「メッシュ」としてそのまま描画」するのではなく、
//  「各頂点（position）」の座標データを抽出して、粒子として動かしている
// glb ... 3Dモデルのファイル形式 のひとつで、GLTF（GL Transmission Format）の バイナリ版
//         → バイナリ形式。1つのファイルにモデル・マテリアル・テクスチャ・アニメーションなどをまとめて格納できる
//         gltfは、JSON形式でテキストベース。テクスチャ画像は外部ファイル
gltfLoader.load('./models.glb', (gltf) => {
	// console.log(gltf); // {scene: Group, scenes: Array(1), animations: Array(0), cameras: Array(0), asset: {…}, …}
	// console.log(gltf.scene.children); // (4) [Mesh, Mesh, Mesh, Mesh]
	//                                       gltfオブジェクトにはいくつかのMeshで構成されている。
	
	particles = {}; // ✅ Pointに関するオブジェクト
	particles.index = 0; // モーフィングするときの各インデックス

	// ✅ glftの中の4つのMeshの頂点を取得
	const positions = gltf.scene.children.map(child => child.geometry.attributes.position)
	// console.log(positions); // (4) [BufferAttribute, BufferAttribute, BufferAttribute, BufferAttribute]

	// ✅ 最大頂点数を揃えていく → 各Meshの頂点はばらばら。
	//                         後からモーフィングするために全て頂点数を揃える
	particles.maxCount = 0; // 頂点自体の数。countであり、x, y, zを含めた数ではない。newArrayがx, y, zを含めた数

	for(const position of positions){ // ✅ 4つのMeshの内で、最も多い頂点数を持つMeshの超点数を格納
		if(position.count > particles.maxCount) particles.maxCount = position.count
		// console.log(particles.maxCount) // ②10242 上書きしていく
	}
	// console.log(particles.maxCount); // 👉 10242。→ 最大は、10242

	particles.positions = []; // 👉 新しく作った頂点(x,y,z)の配列を格納。

	// ✅ 不足する頂点をランダムコピーで埋める
	//    頂点数が足りないMeshは 既存の頂点をランダムにコピー → これで全Meshが同じ長さの頂点配列になる
	for(const position of positions){ // (4) [BufferAttribute, BufferAttribute, BufferAttribute, BufferAttribute]
		// console.log(position); // BufferAttribute {isBufferAttribute: true, name: '', array: Float32Array(29928), itemSize: 3, count: 9976, …}
		// console.log(position.count); // ⭐️ 頂点の数 9976 7958 10240 9522

		// ✅ 元の頂点数 x, y, z の頂点配列
		const originalArray = position.array; // ⭐️ 頂点の座表そのもの。position.count の3倍
		// console.log(originalArray); // Float32Array(29928), Float32Array(23874), Float32Array(30726), Float32Array(28566)
																	
		// ✅ 新しい頂点配列。頂点数を「共通の最大数」にそろえる → モーフィングに使うため。
		// → 一つの頂点をx, y,z で示すために3倍にする
		const newArray = new Float32Array(particles.maxCount * 3); // 10242 * 3 = 30726
		// console.log(newArray); // Float32Array(30726) [0, 0, 0, 0, ,,,] ここではすべて0

		// ⭐️ 新しい配列に入れる予定の頂点数は30726で、元の頂点をできるだけいれる。
		//    しかし、足りない場合は、ランダムな値を生成して頂点をいれていく。
		for(let i = 0; i < particles.maxCount; i++) { // 👉 10242回ループ
			const i3 = i * 3;
			// console.log(i3); // 0 3 6 9 12 ... 3の倍数

			// ✅ 元の頂点を新しい頂点にいれていく。 → この仕組みで3倍の頂点を作ることができる。
			if(i3 < originalArray.length) { // i3 < 29928 
				// console.log("in")
				// 最初のループ　0 1 2、2回目のループ 3 4 5、3回目のループ　6 7 8、... と入れていく
				newArray[i3 + 0] = originalArray[i3 + 0]
				newArray[i3 + 1] = originalArray[i3 + 1]
				newArray[i3 + 2] = originalArray[i3 + 2]
			} else {
				// ✅ 足りない場合。ランダムで頂点を作る。→ どこかで重複する頂点ができる可能性がある
				// console.log("else");
				// position.count ... // 9976 7958 10240 9522 これは頂点自体の数でx,y,zの座標ではない。
				const randomIndex = Math.floor(position.count * Math.random()) * 3; // 0 - 9976
        // console.log(randomIndex);
				newArray[i3 + 0] = originalArray[randomIndex + 0]
				newArray[i3 + 1] = originalArray[randomIndex + 1]
				newArray[i3 + 2] = originalArray[randomIndex + 2]
			}
		}

		particles.positions.push(new Float32BufferAttribute(newArray, 3))

		// ⭐️ このような感じで4つの頂点のオブジェクトが作成される
		// particles.positions = [
		// 	Float32BufferAttribute {...}, // ← 0番目
		// 	Float32BufferAttribute {...}, // ← 1番目
		// 	Float32BufferAttribute {...}, // ← 2番目
		// 	Float32BufferAttribute {...}  // ← 3番目
		// ]
  }
	// console.log(particles);
  
	// ✅ Geometry particlesの頂点関係
	const sizesArray = new Float32Array(particles.maxCount); // 10242
	// console.log(sizesArray); // Float32Array(10242) [0, 0, 0, 0, ...]

	for(let i = 0; i < particles.maxCount; i++) { // 10242
		sizesArray[i] = Math.random();
  }
  // console.log(sizesArray); // Float32Array(10242) 

	particles.geometry = new BufferGeometry();
	// console.log(particles.positions[particles.index]); // Float32BufferAttribute {isBufferAttribute: true, name: '', array: Float32Array(30726), itemSize: 3, count: 10242, …}
	particles.geometry.setAttribute('position', particles.positions[particles.index]); // 初めのモーフィングの頂点をいれる
  // console.log(particles.geometry);
  
	// console.log(particles.positions[3]); // Float32BufferAttribute {isBufferAttribute: true, name: '', array: Float32Array(30726), itemSize: 3, count: 10242, …}
	// console.log(particles.positions); // Array(4)
	particles.geometry.setAttribute('aPositionTarget', particles.positions[3]); // ✅ 移動先の座標(ターゲット)。最後のモーフィングの頂点
	particles.geometry.setAttribute('aSize', new BufferAttribute(sizesArray, 1)); // ランダムな 0 〜 1の少数
																																								// → 各頂点ごとの「個別のサイズ係数」。10242つ。
	// console.log(particles.geometry); // _BufferGeometry {isBufferGeometry: true, uuid: '7b8d6e35-14c6-4a5e-a68a-20384f52e341', name: '', type: 'BufferGeometry', index: null, …}

	// ✅ Material
	particles.colorA = '#ff7300'
	particles.colorB = '#0091ff'
	
	particles.material = new ShaderMaterial({
		vertexShader: particlesVertexShader,
		fragmentShader: particlesFragmentShader,
		uniforms: {
			uSize: new Uniform(0.4), // 全体的な粒子サイズをコントロールするスケール係数
			uResolution: new Uniform(new Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)),
			uProgress: new Uniform(0),
			uColorA: new Uniform(new Color(particles.colorA)),
			uColorB: new Uniform(new Color(particles.colorB))
		},
		blending: AdditiveBlending, // 他のMeshや背景色と重なった場合は色を上書きせずに現実のように色を混ぜ合わせる。
		depthWrite: false
	})

	// ✅ Points → 頂点をPointで表示する
	particles.points = new Points(particles.geometry, particles.material)
	particles.points.frustumCulled = false; // 👉 カメラの視錐台(Frustum)に入っているかどうかで描画するかを自動判定するかを制御
																					//    true(デフォルト)：視錐台外のオブジェクトは描画されない
																					//    false：視錐台外でも描画される
	scene.add(particles.points)

	// ✅ → guiツールから切り替えるメソッド
	particles.morph = (_index) => { // 0 1 2 3
		// 頂点の更新
		particles.geometry.attributes.position = particles.positions[particles.index] // 元のモーフィングの頂点
		particles.geometry.attributes.aPositionTarget = particles.positions[_index] // 移動後のモフィングの頂点

		// Animate uProgress
		gsap.fromTo(particles.material.uniforms.uProgress,
			{ value: 0 },
			{ value: 1, duration: 3, ease: 'expo.out' }
		)

		particles.index = _index // インデックスの更新
	}

	// ✅ guiに登録
	gui.addColor(particles, 'colorA').onChange(() => { particles.material.uniforms.uColorA.value.set(particles.colorA) })
	gui.addColor(particles, 'colorB').onChange(() => { particles.material.uniforms.uColorB.value.set(particles.colorB) })
	gui.add(particles.material.uniforms.uProgress, 'value').min(0).max(1).step(0.001).name('uProgress').listen()

	particles.morph0 = () => { particles.morph(0) }
	particles.morph1 = () => { particles.morph(1) }
	particles.morph2 = () => { particles.morph(2) }
	particles.morph3 = () => { particles.morph(3) }

	// ✅ 関数登録
	gui.add(particles, 'morph0') // particlesオブジェクトの marph0() を登録ということ
	gui.add(particles, 'morph1')
	gui.add(particles, 'morph2')
	gui.add(particles, 'morph3')
});

// render
function render(){
	controls.update()
	renderer.render(scene, camera)
	
	requestAnimationFrame(render)
}

render();