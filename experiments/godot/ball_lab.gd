extends Control
## Authoring experiment, separate from the H3/S3 rendering reference scene.
const Document = preload("res://ball_document.gd")
var document = Document.new()
var history := UndoRedo.new()
var material_field := ShaderMaterial.new()
var preview := ColorRect.new()
var fields: Array[SpinBox] = []
var status := Label.new()
var query := Label.new()
var path_input := LineEdit.new()
var refreshing := false

func _ready() -> void:
	if not document.load_file("res://generated/ball-scene.json"):
		push_error(document.error + " Run node tools/ball-lab-export.js first.")
		get_tree().quit(1)
		return
	var shader := Shader.new()
	shader.code = FileAccess.get_file_as_string("res://generated/ball-preview.gdshader")
	material_field.shader = shader
	var row := HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(row)
	preview.material = material_field
	preview.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(preview)
	var panel := VBoxContainer.new()
	panel.custom_minimum_size.x = 300
	row.add_child(panel)
	_label(panel, "BALL LAB / E3", 24)
	_label(panel, "Scene v1 authoring experiment", 16)
	_label(panel, "Position uses world X / Y / Z.\nZ is up. The camera stays fixed.", 14)
	for i in range(4):
		_label(panel, ["X", "Y", "Z", "Radius"][i], 14)
		var spin := SpinBox.new()
		spin.min_value = -4.0 if i < 3 else 0.01
		spin.max_value = 4.0
		spin.step = 0.01
		spin.allow_greater = true
		spin.allow_lesser = true
		panel.add_child(spin)
		fields.append(spin)
		spin.value_changed.connect(_edit.bind(i))
	var actions := HBoxContainer.new()
	panel.add_child(actions)
	_button(actions, "Undo", func(): history.undo(); _refresh())
	_button(actions, "Redo", func(): history.redo(); _refresh())
	_label(panel, "Scene file", 14)
	path_input.text = "user://ball-lab.nil.json"
	path_input.tooltip_text = "user:// is Godot's application data folder; an absolute path also works."
	panel.add_child(path_input)
	var files := HBoxContainer.new()
	panel.add_child(files)
	_button(files, "Save JSON", _save)
	_button(files, "Load JSON", _load)
	query.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	panel.add_child(query)
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	panel.add_child(status)
	preview.resized.connect(_refresh)
	_refresh()
	if "--ball-check" in OS.get_cmdline_user_args(): call_deferred("_check")

func _label(parent: Node, text: String, font_size: int) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)

func _button(parent: Node, text: String, action: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(action)
	parent.add_child(button)

func _refresh() -> void:
	refreshing = true
	var value: Vector4 = document.parameters()
	var entity: Dictionary = document.ball()
	for i in range(4): fields[i].value = entity.position[i] if i < 3 else entity.radius
	material_field.set_shader_parameter("uBall", value)
	material_field.set_shader_parameter("uRes", preview.size.max(Vector2.ONE))
	query.text = "Signed distance at origin: %.4f\nNegative means inside the ball.\nRegion limit: %.2f units" % [document.distance_to(Vector3.ZERO), document.data.regions[0].extent]
	refreshing = false

func _apply(source: Dictionary) -> void:
	if not document.replace(source):
		status.text = document.error
		return
	_refresh()

func _commit(source: Dictionary, title: String) -> bool:
	var validator = Document.new()
	if not validator.replace(source):
		status.text = validator.error
		_refresh()
		return false
	history.create_action(title)
	history.add_do_method(_apply.bind(source.duplicate(true)))
	history.add_undo_method(_apply.bind(document.data.duplicate(true)))
	history.commit_action()
	status.text = title
	return true

func _edit(changed_value: float, index: int) -> void:
	if refreshing: return
	var entity: Dictionary = document.ball()
	var value: Array = entity.position.duplicate()
	value.append(entity.radius)
	value[index] = changed_value
	_commit(document.edited(value), "Edit ball")

func _save() -> void:
	status.text = "Saved " + ProjectSettings.globalize_path(path_input.text) if document.save_file(path_input.text) else document.error

func _load() -> void:
	var loaded = Document.new()
	if not loaded.load_file(path_input.text):
		status.text = loaded.error
		return
	_commit(loaded.data, "Load scene")

func _check() -> void:
	# Exercise the actual editor callbacks, not just the adapter in isolation.
	var checks: Array = []
	var golden: Array = JSON.parse_string(FileAccess.get_file_as_string("res://generated/ball-golden.json"))
	var worst := 0.0
	for item in golden:
		var p: Array = item.p
		worst = maxf(worst, absf(document.distance_to(Vector3(p[0], p[1], p[2])) - item.d))
	checks.append({"name": "80 JS/native distance samples", "ok": worst < 0.000002, "max_error": worst})
	var original: Dictionary = document.data.duplicate(true)
	var original_shader := material_field.shader
	fields[0].value = 0.5
	fields[3].value = 0.4
	checks.append({"name": "inspector edits field and uniforms", "ok": absf(document.distance_to(Vector3(0.5, 0, 0.25)) + 0.4) < 0.000001 and material_field.get_shader_parameter("uBall").is_equal_approx(Vector4(0.5, 0, 0.25, 0.4))})
	history.undo()
	checks.append({"name": "undo radius", "ok": is_equal_approx(document.parameters().w, 0.6)})
	history.redo()
	checks.append({"name": "redo radius", "ok": is_equal_approx(document.parameters().w, 0.4)})
	DirAccess.make_dir_recursive_absolute("res://results/ball-lab")
	path_input.text = "res://results/ball-lab/saved.nil.json"
	_save()
	var edited: Dictionary = document.data.duplicate(true)
	_apply(original)
	_load()
	checks.append({"name": "save/load preserves scene", "ok": document.data == edited})
	history.undo()
	checks.append({"name": "load is undoable", "ok": document.data == original})
	history.redo()
	var invalid: Dictionary = document.edited([4, 0, 0, 1])
	checks.append({"name": "invalid bounds are atomic", "ok": not _commit(invalid, "Invalid") and document.data == edited})
	invalid = edited.duplicate(true)
	invalid.regions[0].geometry.kind = "h3"
	checks.append({"name": "unsupported geometry rejected", "ok": not _commit(invalid, "Invalid") and document.data == edited})
	checks.append({"name": "edits do not replace shader", "ok": material_field.shader == original_shader})
	status.text = "Validation complete"
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var capture := get_viewport().get_texture().get_image()
	checks.append({"name": "saved rendered image", "ok": capture.save_png("res://results/ball-lab/editor.png") == OK})
	var report := FileAccess.open("res://results/ball-lab/report.json", FileAccess.WRITE)
	report.store_string(JSON.stringify(checks, "  "))
	report.close()
	var failed := 0
	for check in checks:
		print(("PASS " if check.ok else "FAIL ") + check.name)
		if not check.ok: failed += 1
	history.clear_history()
	get_tree().quit(1 if failed else 0)

func _exit_tree() -> void:
	history.clear_history()
	history.free()
