"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type ScenePreset = "laptop" | "building" | "phone" | "cap";

type ModelSceneProps = {
  model: string;
  preset: ScenePreset;
  label: string;
  eager?: boolean;
  preloadNext?: string;
};

const preloadedModels = new Set<string>();

function preloadModel(model: string) {
  if (preloadedModels.has(model)) return;
  preloadedModels.add(model);

  void fetch(model, {
    cache: "force-cache",
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) preloadedModels.delete(model);
    })
    .catch(() => {
      preloadedModels.delete(model);
    });
}

const presets: Record<
  ScenePreset,
  {
    size: number;
    rotation: [number, number, number];
    cameraZ: number;
    modelY: number;
    ground: number;
    light: number;
  }
> = {
  laptop: {
    size: 3.8,
    rotation: [0.02, -0.35, -0.02],
    cameraZ: 6.2,
    modelY: 0.48,
    ground: 0xd9d6ce,
    light: 0xc7de5d,
  },
  building: {
    size: 4.2,
    rotation: [-0.02, 0.62, 0],
    cameraZ: 6.7,
    modelY: 0.05,
    ground: 0xcfc8ba,
    light: 0xf1a66f,
  },
  phone: {
    size: 2.65,
    rotation: [0.04, -0.38, -0.04],
    cameraZ: 5.7,
    modelY: 0.08,
    ground: 0x9d3925,
    light: 0xffc7a0,
  },
  cap: {
    size: 2.65,
    rotation: [-0.08, 0.4, -0.08],
    cameraZ: 5.6,
    modelY: 0.42,
    ground: 0x1d2927,
    light: 0xbfd964,
  },
};

function prepareModel(object: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / largestAxis;

  object.scale.setScalar(scale);
  object.position.copy(center).multiplyScalar(-scale);

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = 0.7;
        material.roughness = Math.max(material.roughness, 0.32);
      }
    });
  });
}

export function ModelScene({ model, preset, label, eager = false, preloadNext }: ModelSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldMount, setShouldMount] = useState(eager);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (shouldMount) return;
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldMount(true);
      observer.disconnect();
    }, { rootMargin: "700px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, [shouldMount]);

  useEffect(() => {
    if (!shouldMount) return;
    const host = hostRef.current;
    if (!host) return;
    const config = presets[preset];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50);
    camera.position.set(0, 0.25, config.cameraZ);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: window.devicePixelRatio <= 1.5, powerPreference: "high-performance" });
    } catch { return; }
    const compactViewport = window.matchMedia("(max-width: 767px)").matches;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compactViewport ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${preset} 3D model. Drag to rotate. On phones, swipe sideways to rotate or vertically to scroll. Arrow keys rotate; Home restores the view.`);
    canvas.style.touchAction = "pan-y pinch-zoom";
    canvas.style.cursor = "grab";
    host.appendChild(canvas);

    scene.add(new THREE.HemisphereLight(0xffffff, config.ground, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 4.5);
    key.position.set(-3, 5, 5);
    key.castShadow = true;
    const shadowMapSize = compactViewport ? 512 : 1024;
    key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    scene.add(key);
    const edge = new THREE.PointLight(config.light, 13, 10, 2);
    edge.position.set(3.5, 1.5, 3);
    scene.add(edge);
    const modelRoot = new THREE.Group();
    modelRoot.rotation.set(...config.rotation);
    modelRoot.position.y = config.modelY;
    scene.add(modelRoot);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 48), new THREE.ShadowMaterial({ color: 0x000000, opacity: preset === "phone" ? 0.22 : 0.16 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.25;
    shadow.receiveShadow = true;
    scene.add(shadow);

    const disposeObject = (object: THREE.Object3D) => object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        Object.values(material).forEach(value => { if (value instanceof THREE.Texture) value.dispose(); });
        material.dispose();
      });
    });
    let disposed = false;
    let modelReady = false;
    let hasInteracted = false;
    const gameActive = () => document.documentElement.dataset.destroyerActive === "true";
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(model, gltf => {
      if (disposed) { disposeObject(gltf.scene); return; }
      // Stand the phone's original flat XZ plane up with its screen facing the camera.
      if (preset === "phone") gltf.scene.rotation.x += Math.PI / 2;
      prepareModel(gltf.scene, config.size);
      modelRoot.add(gltf.scene);
      modelReady = true;
      setLoaded(true);
      if (preloadNext) preloadModel(preloadNext);
    }, undefined, () => { /* Keep the fallback if loading fails. */ });

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    let drag: { id: number; x: number; y: number; startX: number; startY: number; touch: boolean; moving: boolean } | null = null;
    const stopDrag = () => {
      const id = drag?.id;
      drag = null;
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      canvas.style.cursor = "grab";
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!modelReady || gameActive() || drag || !event.isPrimary || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, touch: event.pointerType === "touch", moving: false };
      canvas.setPointerCapture(event.pointerId);
      if (event.pointerType !== "touch") canvas.focus({ preventScroll: true });
    };
    const onDragMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId || gameActive()) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moving) {
        const totalX = event.clientX - drag.startX;
        const totalY = event.clientY - drag.startY;
        if (Math.hypot(totalX, totalY) < 6) return;
        // Vertical touch gestures belong to page scrolling.
        if (drag.touch && Math.abs(totalY) >= Math.abs(totalX)) { stopDrag(); return; }
        drag.moving = true;
        hasInteracted = true;
        canvas.style.cursor = "grabbing";
      }
      modelRoot.rotation.y += dx * 0.008;
      modelRoot.rotation.x = THREE.MathUtils.clamp(modelRoot.rotation.x + dy * 0.008, -Math.PI / 2, Math.PI / 2);
      drag.x = event.clientX;
      drag.y = event.clientY;
    };
    const onPointerEnd = (event: PointerEvent) => { if (drag?.id === event.pointerId) stopDrag(); };
    const onPointerMove = (event: PointerEvent) => {
      if (gameActive() || hasInteracted || drag) return;
      const bounds = host.getBoundingClientRect();
      target.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2);
    };
    const onPointerLeave = () => target.set(0, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!modelReady || gameActive() || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
      event.preventDefault();
      hasInteracted = true;
      if (event.key === "Home") {
        stopDrag();
        modelRoot.rotation.set(...config.rotation);
        hasInteracted = false;
        target.set(0, 0);
        pointer.set(0, 0);
        return;
      }
      if (event.key === "ArrowLeft") modelRoot.rotation.y -= 0.15;
      if (event.key === "ArrowRight") modelRoot.rotation.y += 0.15;
      if (event.key === "ArrowUp") modelRoot.rotation.x -= 0.15;
      if (event.key === "ArrowDown") modelRoot.rotation.x += 0.15;
      modelRoot.rotation.x = THREE.MathUtils.clamp(modelRoot.rotation.x, -Math.PI / 2, Math.PI / 2);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onDragMove, { passive: true });
    canvas.addEventListener("pointerup", onPointerEnd);
    canvas.addEventListener("pointercancel", onPointerEnd);
    canvas.addEventListener("lostpointercapture", onPointerEnd);
    canvas.addEventListener("keydown", onKeyDown);
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = config.cameraZ + (width < 520 ? 1.15 : 0);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    const frameInterval = compactViewport || reducedMotion ? 1000 / 30 : 1000 / 60;
    let visible = false;
    let frame = 0;
    let previousFrameTime = 0;
    const render = (time: number) => {
      frame = 0;
      if (!visible || document.hidden || disposed || gameActive()) return;
      if (time - previousFrameTime >= frameInterval) {
        previousFrameTime = time;
        const elapsed = clock.getElapsedTime();
        if (!hasInteracted && !drag) {
          pointer.lerp(target, 0.045);
          modelRoot.rotation.y += (config.rotation[1] + pointer.x * 0.12 - modelRoot.rotation.y) * 0.035;
          modelRoot.rotation.x += (config.rotation[0] - pointer.y * 0.05 - modelRoot.rotation.x) * 0.035;
          if (!reducedMotion) modelRoot.position.y = config.modelY + Math.sin(elapsed * 0.72) * 0.055;
        }
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      frame = window.requestAnimationFrame(render);
    };
    const startRendering = () => {
      if (!frame && visible && !document.hidden && !gameActive()) {
        clock.getDelta();
        frame = window.requestAnimationFrame(render);
      }
    };
    const stopRendering = () => { if (frame) window.cancelAnimationFrame(frame); frame = 0; };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) startRendering();
      else { stopDrag(); stopRendering(); }
    });
    visibilityObserver.observe(host);
    const onVisibilityChange = () => {
      if (document.hidden) { stopDrag(); stopRendering(); }
      else startRendering();
    };
    const onDestroyerActivity = () => {
      if (gameActive()) { stopDrag(); stopRendering(); }
      else startRendering();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("destroyer-activity", onDestroyerActivity);
    return () => {
      disposed = true;
      stopDrag();
      stopRendering();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onDragMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("lostpointercapture", onPointerEnd);
      canvas.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("destroyer-activity", onDestroyerActivity);
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    };
  }, [model, preloadNext, preset, shouldMount]);

  return (
    <div ref={hostRef} className="absolute inset-0">
      <div className={`absolute inset-0 grid place-items-center transition-opacity duration-500 ${loaded ? "pointer-events-none opacity-0" : "opacity-100"}`} aria-hidden="true">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-35">{label}</span>
      </div>
    </div>
  );
}
