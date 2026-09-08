extends Control
## Rendering only: camera fixtures come from the JS reference; no replacement
## physics or Euclidean CharacterBody. Arrow keys switch views, mouse drag looks.

var fixture: Dictionary
var viewport: SubViewport
var surface: ColorRect
var label: Label
var materials: Dictionary = {}
var selected := 0
var yaw := 0.0
var pitch := 0.0
var benchmark := false
var started := Time.get_ticks_usec()

func _ready() -> void:
	benchmark = "--benchmark" in OS.get_cmdline_user_args()
	if not FileAccess.file_exists("res://generated/views.json"):
		push_error("Run node tools/godot-export.js from the repository root first.")
		get_tree().quit(1)
		return
	fixture = JSON.parse_string(FileAccess.get_file_as_string("res://generated/views.json"))
	viewport = SubViewport.new()
	viewport.size = Vector2i(int(fixture.width), int(fixture.height))
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	RenderingServer.viewport_set_measure_render_time(viewport.get_viewport_rid(), true)
	surface = ColorRect.new()
	surface.size = Vector2(viewport.size)
	viewport.add_child(surface)
	var display := TextureRect.new()
	display.texture = viewport.get_texture()
	display.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	display.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	display.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(display)
	label = Label.new()
	label.position = Vector2(16, 12)
	add_child(label)
	if benchmark:
		run_benchmark()
	else:
		select_view(0)

func projection(values: Array) -> Projection:
	return Projection(Vector4(values[0], values[1], values[2], values[3]),
		Vector4(values[4], values[5], values[6], values[7]),
		Vector4(values[8], values[9], values[10], values[11]),
		Vector4(values[12], values[13], values[14], values[15]))

func select_view(index: int) -> void:
	selected = posmod(index, fixture.views.size())
	var view: Dictionary = fixture.views[selected]
	if not materials.has(view.geometry):
		var shader := Shader.new()
		shader.code = FileAccess.get_file_as_string("res://generated/%s.gdshader" % view.geometry)
		var material := ShaderMaterial.new()
		material.shader = shader
		materials[view.geometry] = material
	surface.material = materials[view.geometry]
	for key in view.uniforms:
		var value = view.uniforms[key]
		if key == "uPlayer":
			value = projection(value)
		elif key == "uRes":
			value = Vector2(value[0], value[1])
		elif key in ["uMarkN", "uCutN"]:
			value = int(value)
		surface.material.set_shader_parameter(key, value)
	yaw = view.uniforms.uYaw
	pitch = view.uniforms.uPitch
	label.text = "%s | %s | %dx%d\nLeft/Right: view   Drag: look   R: reset   Esc: quit\nRendering experiment: no movement, collision or editor yet" % [
		view.id, RenderingServer.get_current_rendering_method(), viewport.size.x, viewport.size.y]

func _unhandled_input(event: InputEvent) -> void:
	if benchmark:
		return
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_RIGHT: select_view(selected + 1)
			KEY_LEFT: select_view(selected - 1)
			KEY_R: select_view(selected)
			KEY_ESCAPE: get_tree().quit()
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		yaw -= event.relative.x * 0.004
		pitch = clampf(pitch - event.relative.y * 0.004, -1.5, 1.5)
		surface.material.set_shader_parameter("uYaw", yaw)
		surface.material.set_shader_parameter("uPitch", pitch)

func median(values: Array) -> float:
	values.sort()
	return values[values.size() / 2]

func run_benchmark() -> void:
	var results: Array = []
	var result_root := "res://results/" + RenderingServer.get_current_rendering_method()
	DirAccess.make_dir_recursive_absolute(result_root)
	for i in range(fixture.views.size()):
		var begin := Time.get_ticks_usec()
		select_view(i)
		await RenderingServer.frame_post_draw
		var first_ms := (Time.get_ticks_usec() - begin) / 1000.0
		var gpu: Array = []
		var cpu: Array = []
		for frame in range(90):
			await RenderingServer.frame_post_draw
			if frame >= 30:
				gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(viewport.get_viewport_rid()))
				cpu.append(RenderingServer.viewport_get_measured_render_time_cpu(viewport.get_viewport_rid()))
		var image := viewport.get_texture().get_image()
		image.convert(Image.FORMAT_RGBA8)
		var id: String = fixture.views[i].id
		image.save_png("%s/%s.png" % [result_root, id])
		var pixels := FileAccess.open("%s/%s.rgba" % [result_root, id], FileAccess.WRITE)
		pixels.store_buffer(image.get_data())
		pixels.close()
		results.append({"id": id, "first_frame_ms": first_ms,
			"gpu_median_ms": median(gpu), "cpu_render_median_ms": median(cpu)})
		print(JSON.stringify(results.back()))
	var report := {"engine": Engine.get_version_info().string,
		"backend": RenderingServer.get_current_rendering_method(),
		"device": RenderingServer.get_video_adapter_name(),
		"width": viewport.size.x, "height": viewport.size.y,
		"elapsed_ms": (Time.get_ticks_usec() - started) / 1000.0, "views": results}
	var file := FileAccess.open(result_root + "/report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t") + "\n")
	file.close()
	get_tree().quit()
