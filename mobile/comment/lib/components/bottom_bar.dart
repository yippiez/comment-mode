import 'dart:ui' as ui;

import 'package:comment/components/new_card_popup.dart';
import 'package:comment/components/settings_popup.dart';
import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

const _bottomBarButtonSize = 70.0;
const _expandedSearchHeight = 50.0;
const _searchMorphDuration = Duration(milliseconds: 100);
const _newCardPopupDuration = Duration(milliseconds: 130);

class BottomBar extends StatefulWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onConnections;
  final VoidCallback? onNewCard;
  final VoidCallback? onSearchOpen;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onSearchClose;
  final VoidCallback? onSearchSubmit;
  final VoidCallback? onArchive;
  final bool isSettingsPopupOpen;
  final bool isSearchOpen;
  final String searchQuery;
  final bool isNewCardPopupOpen;
  final VoidCallback? onSettingsPopupOpen;
  final VoidCallback? onNewCardPopupOpen;
  final VoidCallback? onNewCardPopupClose;

  const BottomBar({
    super.key,
    this.onExtensions,
    this.onConnections,
    this.onNewCard,
    this.onSearchOpen,
    this.onSearchChanged,
    this.onSearchClose,
    this.onSearchSubmit,
    this.onArchive,
    required this.isSettingsPopupOpen,
    required this.isSearchOpen,
    required this.searchQuery,
    this.isNewCardPopupOpen = false,
    this.onSettingsPopupOpen,
    this.onNewCardPopupOpen,
    this.onNewCardPopupClose,
  });

  @override
  State<BottomBar> createState() => _BottomBarState();
}

class _BottomBarState extends State<BottomBar> with TickerProviderStateMixin {
  late final AnimationController _searchMorphController;
  late final Animation<double> _searchMorphProgress;
  late final AnimationController _settingsPopupController;
  late final Animation<double> _settingsPopupProgress;
  late final AnimationController _popupController;
  late final Animation<double> _popupProgress;
  late final TextEditingController _searchController;
  late final FocusNode _searchFocusNode;

  @override
  void initState() {
    super.initState();
    _searchMorphController = AnimationController(
      vsync: this,
      duration: _searchMorphDuration,
      value: widget.isSearchOpen ? 1.0 : 0.0,
    );
    _searchMorphProgress = CurvedAnimation(
      parent: _searchMorphController,
      curve: Curves.easeOut,
      reverseCurve: Curves.easeIn,
    );
    _settingsPopupController = AnimationController(
      vsync: this,
      duration: _newCardPopupDuration,
      value: widget.isSettingsPopupOpen ? 1.0 : 0.0,
    );
    _settingsPopupProgress = CurvedAnimation(
      parent: _settingsPopupController,
      curve: Curves.easeOut,
      reverseCurve: Curves.easeIn,
    );
    _popupController = AnimationController(
      vsync: this,
      duration: _newCardPopupDuration,
      value: widget.isNewCardPopupOpen ? 1.0 : 0.0,
    );
    _popupProgress = CurvedAnimation(
      parent: _popupController,
      curve: Curves.easeOut,
      reverseCurve: Curves.easeIn,
    );
    _searchController = TextEditingController(text: widget.searchQuery);
    _searchFocusNode = FocusNode();

    if (widget.isSearchOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.isSearchOpen) {
          _searchFocusNode.requestFocus();
        }
      });
    }
  }

  @override
  void didUpdateWidget(covariant BottomBar oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (widget.searchQuery != _searchController.text) {
      _searchController.value = TextEditingValue(
        text: widget.searchQuery,
        selection: TextSelection.collapsed(offset: widget.searchQuery.length),
      );
    }

    if (widget.isSearchOpen && !oldWidget.isSearchOpen) {
      _searchMorphController.forward();
      Future<void>.delayed(const Duration(milliseconds: 60), () {
        if (mounted && widget.isSearchOpen) {
          _searchFocusNode.requestFocus();
        }
      });
    } else if (!widget.isSearchOpen && oldWidget.isSearchOpen) {
      _searchFocusNode.unfocus();
      _searchMorphController.reverse();
    }

    if (widget.isSettingsPopupOpen && !oldWidget.isSettingsPopupOpen) {
      _settingsPopupController.forward();
    } else if (!widget.isSettingsPopupOpen && oldWidget.isSettingsPopupOpen) {
      _settingsPopupController.reverse();
    }

    if (widget.isNewCardPopupOpen && !oldWidget.isNewCardPopupOpen) {
      _popupController.forward();
    } else if (!widget.isNewCardPopupOpen && oldWidget.isNewCardPopupOpen) {
      _popupController.reverse();
    }
  }

  @override
  void dispose() {
    _searchMorphController.dispose();
    _settingsPopupController.dispose();
    _popupController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.of(context).viewInsets.bottom;

    return AnimatedBuilder(
      animation: Listenable.merge([
        _searchMorphProgress,
        _settingsPopupProgress,
        _popupProgress,
      ]),
      builder: (context, _) {
        final paddingProgress = _searchMorphProgress.value;
        final settingsPopupExtent =
            widget.isSettingsPopupOpen || _settingsPopupProgress.value > 0.001
            ? (SettingsPopupLayout.height + SettingsPopupLayout.gap)
            : 0.0;
        final newCardPopupExtent =
            widget.isNewCardPopupOpen || _popupProgress.value > 0.001
            ? (NewCardPopupLayout.height + NewCardPopupLayout.gap)
            : 0.0;
        final popupExtent = settingsPopupExtent > newCardPopupExtent
            ? settingsPopupExtent
            : newCardPopupExtent;
        final bottomPadding =
            (ui.lerpDouble(32, 0, paddingProgress) ?? 0) +
            (keyboardInset * paddingProgress);

        return SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              bottom: bottomPadding,
            ),
            child: SizedBox(
              height: _bottomBarButtonSize + popupExtent,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final maxWidth = constraints.maxWidth;
                  final slotWidth = maxWidth / 4;
                  final collapsedWidth = _bottomBarButtonSize;
                  final searchCollapsedLeft =
                      (slotWidth * 2.5) - (collapsedWidth / 2);

                  final settingsSlotCenter = slotWidth * 0.5;
                  final newCardSlotCenter = slotWidth * 3.5;
                  final settingsPopupWidth =
                      maxWidth < SettingsPopupLayout.width
                      ? maxWidth
                      : SettingsPopupLayout.width;
                  final newCardPopupWidth = maxWidth < NewCardPopupLayout.width
                      ? maxWidth
                      : NewCardPopupLayout.width;

                  return AnimatedBuilder(
                    animation: Listenable.merge([
                      _searchMorphProgress,
                      _settingsPopupProgress,
                      _popupProgress,
                    ]),
                    builder: (context, _) {
                      final st = _searchMorphProgress.value;
                      final settingsPt = _settingsPopupProgress.value;
                      final newCardPt = _popupProgress.value;
                      final rowTop =
                          constraints.maxHeight - _bottomBarButtonSize;

                      // --- Search morph calculations (unchanged) ---
                      final searchLeft =
                          ui.lerpDouble(searchCollapsedLeft, 0, st) ?? 0;
                      final searchWidth =
                          ui.lerpDouble(collapsedWidth, maxWidth, st) ??
                          maxWidth;
                      final searchHeight =
                          ui.lerpDouble(
                            _bottomBarButtonSize,
                            _expandedSearchHeight,
                            st,
                          ) ??
                          _expandedSearchHeight;
                      final searchTop =
                          rowTop + ((_bottomBarButtonSize - searchHeight) / 2);
                      final searchRadius = ui.lerpDouble(36, 24, st) ?? 24;
                      final searchActionsFade =
                          1 -
                          Curves.easeOut.transform((st / 0.35).clamp(0.0, 1.0));
                      final searchActionsScale =
                          ui.lerpDouble(0.94, 1.0, searchActionsFade) ?? 1.0;
                      final fieldReveal = Curves.easeInOut.transform(
                        ((st - 0.2) / 0.8).clamp(0, 1),
                      );

                      final settingsPopupEased = Curves.easeOutCubic.transform(
                        settingsPt,
                      );
                      final settingsPopupScale = settingsPopupEased;
                      final settingsPopupOpacity = settingsPopupEased.clamp(
                        0.0,
                        1.0,
                      );
                      final settingsPopupLeft = 0.0;
                      final settingsPopupTop =
                          rowTop -
                          SettingsPopupLayout.gap -
                          SettingsPopupLayout.height;
                      final settingsPopupOriginX =
                          settingsSlotCenter - settingsPopupLeft;
                      final settingsPopupOriginY =
                          SettingsPopupLayout.height +
                          SettingsPopupLayout.gap +
                          (_bottomBarButtonSize / 2);

                      final newCardPopupEased = Curves.easeOutCubic.transform(
                        newCardPt,
                      );
                      final newCardPopupScale = newCardPopupEased;
                      final newCardPopupOpacity = newCardPopupEased.clamp(
                        0.0,
                        1.0,
                      );
                      final newCardPopupLeft = maxWidth - newCardPopupWidth;
                      final newCardPopupTop =
                          rowTop -
                          NewCardPopupLayout.gap -
                          NewCardPopupLayout.height;
                      final newCardPopupOriginX =
                          newCardSlotCenter - newCardPopupLeft;
                      final newCardPopupOriginY =
                          NewCardPopupLayout.height +
                          NewCardPopupLayout.gap +
                          (_bottomBarButtonSize / 2);

                      return Stack(
                        clipBehavior: Clip.none,
                        children: [
                          if (settingsPt > 0.001)
                            Positioned(
                              left: settingsPopupLeft,
                              top: settingsPopupTop,
                              width: settingsPopupWidth,
                              height: SettingsPopupLayout.height,
                              child: IgnorePointer(
                                ignoring: settingsPt < 0.5,
                                child: Opacity(
                                  opacity: settingsPopupOpacity,
                                  child: Transform(
                                    alignment: FractionalOriginAlignment(
                                      settingsPopupOriginX / settingsPopupWidth,
                                      settingsPopupOriginY /
                                          SettingsPopupLayout.height,
                                    ),
                                    transform: Matrix4.identity()
                                      ..scaleByDouble(
                                        settingsPopupScale,
                                        settingsPopupScale,
                                        1.0,
                                        1.0,
                                      ),
                                    child: SettingsPopupContent(
                                      onExtensions: widget.onExtensions,
                                      onConnections: widget.onConnections,
                                    ),
                                  ),
                                ),
                              ),
                            ),

                          if (newCardPt > 0.001)
                            Positioned(
                              left: newCardPopupLeft,
                              top: newCardPopupTop,
                              width: newCardPopupWidth,
                              height: NewCardPopupLayout.height,
                              child: IgnorePointer(
                                ignoring: newCardPt < 0.5,
                                child: Opacity(
                                  opacity: newCardPopupOpacity,
                                  child: Transform(
                                    alignment: FractionalOriginAlignment(
                                      newCardPopupOriginX / newCardPopupWidth,
                                      newCardPopupOriginY /
                                          NewCardPopupLayout.height,
                                    ),
                                    transform: Matrix4.identity()
                                      ..scaleByDouble(
                                        newCardPopupScale,
                                        newCardPopupScale,
                                        1.0,
                                        1.0,
                                      ),
                                    child: NewCardPopupContent(
                                      onNewCard: widget.onNewCard,
                                    ),
                                  ),
                                ),
                              ),
                            ),

                          // --- Action buttons row (fades when search opens) ---
                          Positioned(
                            left: 0,
                            right: 0,
                            top: rowTop,
                            height: _bottomBarButtonSize,
                            child: IgnorePointer(
                              ignoring:
                                  widget.isSearchOpen ||
                                  searchActionsFade <= 0.01,
                              child: Opacity(
                                opacity: searchActionsFade,
                                child: Transform.scale(
                                  scale: searchActionsScale,
                                  child: _ActionSlotsRow(
                                    onSettings: widget.onSettingsPopupOpen,
                                    onArchive: widget.onArchive,
                                    onNew: widget.onNewCardPopupOpen,
                                    searchSlot: const SizedBox(
                                      width: _bottomBarButtonSize,
                                      height: _bottomBarButtonSize,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),

                          // --- Search morphing surface ---
                          Positioned(
                            top: searchTop,
                            left: searchLeft,
                            width: searchWidth,
                            height: searchHeight,
                            child: _MorphingSearchSurface(
                              isOpen: widget.isSearchOpen,
                              progress: st,
                              borderRadius: searchRadius,
                              controller: _searchController,
                              focusNode: _searchFocusNode,
                              onOpen: widget.onSearchOpen,
                              onChanged: widget.onSearchChanged,
                              onClose: widget.onSearchClose,
                              onSubmit: widget.onSearchSubmit,
                              fieldReveal: fieldReveal,
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ActionSlotsRow extends StatelessWidget {
  final VoidCallback? onSettings;
  final VoidCallback? onArchive;
  final VoidCallback? onNew;
  final Widget searchSlot;

  const _ActionSlotsRow({
    this.onSettings,
    this.onArchive,
    this.onNew,
    required this.searchSlot,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Center(
            child: _BottomActionButton(
              icon: const Icon(Icons.settings, size: 31, color: Colors.white),
              label: 'Settings',
              onTap: onSettings,
            ),
          ),
        ),
        Expanded(
          child: Center(
            child: _BottomActionButton(
              icon: const Icon(
                Icons.archive_outlined,
                size: 31,
                color: Colors.white,
              ),
              label: 'Archive',
              onTap: onArchive,
            ),
          ),
        ),
        Expanded(child: Center(child: searchSlot)),
        Expanded(
          child: Center(
            child: _BottomActionButton(
              icon: const Icon(Icons.add, size: 31, color: Colors.white),
              label: '+ New',
              onTap: onNew,
            ),
          ),
        ),
      ],
    );
  }
}

class _MorphingSearchSurface extends StatefulWidget {
  final bool isOpen;
  final double progress;
  final double borderRadius;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback? onOpen;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onClose;
  final VoidCallback? onSubmit;
  final double fieldReveal;

  const _MorphingSearchSurface({
    required this.isOpen,
    required this.progress,
    required this.borderRadius,
    required this.controller,
    required this.focusNode,
    this.onOpen,
    this.onChanged,
    this.onClose,
    this.onSubmit,
    required this.fieldReveal,
  });

  @override
  State<_MorphingSearchSurface> createState() => _MorphingSearchSurfaceState();
}

class _MorphingSearchSurfaceState extends State<_MorphingSearchSurface>
    with SingleTickerProviderStateMixin {
  static const _jellyFadeOutProgress = 0.68;

  late final AnimationController _saturationController;
  late final Animation<double> _saturationAnimation;

  @override
  void initState() {
    super.initState();
    _saturationController = AnimationController(
      duration: const Duration(milliseconds: 30),
      vsync: this,
    );
    _saturationAnimation = CurvedAnimation(
      parent: _saturationController,
      curve: Curves.easeOut,
    );
  }

  @override
  void didUpdateWidget(covariant _MorphingSearchSurface oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.progress >= _jellyFadeOutProgress &&
        oldWidget.progress < _jellyFadeOutProgress) {
      _saturationController.value = 0;
    }
  }

  @override
  void dispose() {
    _saturationController.dispose();
    super.dispose();
  }

  bool get _isJellyInteractive => widget.progress < _jellyFadeOutProgress;

  void _handleTapDown(TapDownDetails details) {
    if (!_isJellyInteractive) {
      return;
    }
    _saturationController.forward();
  }

  void _handleTapUp(TapUpDetails details) {
    _saturationController.reverse();
  }

  void _handleTapCancel() {
    _saturationController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final iconFade =
        1 - Curves.easeOut.transform((widget.progress / 0.45).clamp(0, 1));
    final horizontalPadding =
        ui.lerpDouble(0, 12, Curves.easeOut.transform(widget.progress)) ?? 12;
    final closeReveal = Curves.easeOut.transform(
      ((widget.progress - 0.45) / 0.55).clamp(0, 1),
    );
    final jellyProgress =
        1 - (widget.progress / _jellyFadeOutProgress).clamp(0.0, 1.0);
    final jellyFactor = Curves.easeOut.transform(jellyProgress);
    final interactionScale = ui.lerpDouble(1.0, 1.05, jellyFactor) ?? 1.0;
    final stretch = ui.lerpDouble(0.0, 0.5, jellyFactor) ?? 0.0;
    final resistance = ui.lerpDouble(0.0, 0.08, jellyFactor) ?? 0.08;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.isOpen ? widget.focusNode.requestFocus : widget.onOpen,
      onTapDown: _isJellyInteractive ? _handleTapDown : null,
      onTapUp: _isJellyInteractive ? _handleTapUp : null,
      onTapCancel: _handleTapCancel,
      child: RepaintBoundary(
        child: LiquidStretch(
          interactionScale: interactionScale,
          stretch: stretch,
          resistance: resistance,
          hitTestBehavior: HitTestBehavior.opaque,
          child: AnimatedBuilder(
            animation: _saturationAnimation,
            builder: (context, child) {
              final glowIntensity = (_saturationAnimation.value * jellyFactor)
                  .clamp(0.0, 1.0);
              return AdaptiveGlass(
                shape: LiquidRoundedSuperellipse(
                  borderRadius: widget.borderRadius,
                ),
                settings: InheritedLiquidGlass.ofOrDefault(context),
                quality: GlassQuality.standard,
                useOwnLayer: true,
                clipBehavior: Clip.antiAlias,
                glowIntensity: glowIntensity,
                child: child!,
              );
            },
            child: SizedBox.expand(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    IgnorePointer(
                      ignoring: widget.isOpen,
                      child: Opacity(
                        opacity: iconFade,
                        child: const Center(
                          child: Icon(
                            Icons.search,
                            size: 31,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    if (widget.fieldReveal > 0.001)
                      IgnorePointer(
                        ignoring: !widget.isOpen || widget.fieldReveal < 0.75,
                        child: Opacity(
                          opacity: widget.fieldReveal,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.search,
                                size: 24,
                                color: Colors.white70,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Center(
                                  child: Theme(
                                    data: Theme.of(context).copyWith(
                                      textSelectionTheme:
                                          const TextSelectionThemeData(
                                            cursorColor: Colors.white,
                                            selectionColor: Colors.white30,
                                            selectionHandleColor: Colors.white,
                                          ),
                                      colorScheme: Theme.of(context).colorScheme
                                          .copyWith(primary: Colors.white),
                                    ),
                                    child: TextField(
                                      controller: widget.controller,
                                      focusNode: widget.focusNode,
                                      onChanged: widget.onChanged,
                                      onSubmitted: (_) =>
                                          widget.onSubmit?.call(),
                                      textInputAction: TextInputAction.search,
                                      maxLines: 1,
                                      expands: false,
                                      textAlignVertical:
                                          TextAlignVertical.center,
                                      cursorColor: Colors.white,
                                      decoration: const InputDecoration(
                                        filled: false,
                                        fillColor: Colors.transparent,
                                        isDense: true,
                                        isCollapsed: true,
                                        border: InputBorder.none,
                                        enabledBorder: InputBorder.none,
                                        focusedBorder: InputBorder.none,
                                        disabledBorder: InputBorder.none,
                                        errorBorder: InputBorder.none,
                                        focusedErrorBorder: InputBorder.none,
                                        contentPadding: EdgeInsets.symmetric(
                                          vertical: 8,
                                        ),
                                        hintText: 'Search',
                                        hintStyle: TextStyle(
                                          color: Colors.white54,
                                          fontSize: 16,
                                        ),
                                      ),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Opacity(
                                opacity: closeReveal,
                                child: SizedBox(
                                  width: 38,
                                  height: 38,
                                  child: IconButton(
                                    style: IconButton.styleFrom(
                                      foregroundColor: Colors.white70,
                                      overlayColor: Colors.white24,
                                      padding: EdgeInsets.zero,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                    iconSize: 20,
                                    visualDensity: VisualDensity.compact,
                                    icon: const Icon(Icons.close_rounded),
                                    onPressed: widget.isOpen
                                        ? widget.onClose
                                        : null,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    // WARNING: Keep this as one always-mounted AdaptiveGlass.
                    // Replacing this with separate closed/open glass trees (including
                    // AnimatedSwitcher/IndexedStack branch swaps) can re-create web
                    // shader instances and cause the transparent -> frosted flash.
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomActionButton extends StatelessWidget {
  final Widget icon;
  final String label;
  final VoidCallback? onTap;

  const _BottomActionButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassButton.custom(
      width: _bottomBarButtonSize,
      height: _bottomBarButtonSize,
      shape: const LiquidRoundedSuperellipse(borderRadius: 36),
      label: label,
      onTap: onTap ?? () {},
      useOwnLayer: true,
      quality: GlassQuality.standard,
      glowRadius: 1.1,
      child: Center(child: icon),
    );
  }
}
