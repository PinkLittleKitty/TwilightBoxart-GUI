using System;
using System.Collections.Generic;
using System.IO;
using TwilightBoxart.Helpers;
using TwilightBoxart.Models.Base;

namespace TwilightBoxart
{
    public interface IAppConfig : IBoxartConfig
    {
        string SdRoot { get; set; }
        string BoxartPath { get; set; }
        string SettingsPath { get; set; }
        bool OverwriteExisting { get; set; }
    }

    public interface IRequestModel : IBoxartConfig
    {
        string Sha1 { get; set; }
        string Filename { get; set; }
        string TitleId { get; set; }
        byte[] Header { get; set; }
    }

    public interface IBoxartConfig
    {
        string CachePath { get; set; }
        int BoxartWidth { get; set; }
        int BoxartHeight { get; set; }
        bool KeepAspectRatio { get; set; }
        BoxartBorderStyle BoxartBorderStyle { get; set; }
        int BoxartBorderThickness { get; set; }
        uint BoxartBorderColor { get; set; }
    }

    public class BoxartConfig : IniSettings, IAppConfig
    {
        public string SdRoot { get; set; } = "";
        public string BoxartPath { get; set; } = @"{sdroot}\_nds\TWiLightMenu\boxart";
        public string SettingsPath { get; set; } = @"{sdroot}\_nds\TWiLightMenu\settings.ini";
        public string CachePath { get; set; } = "Cache";

        public int BoxartWidth { get; set; } = 128;
        public int BoxartHeight { get; set; } = 115;
        public bool KeepAspectRatio { get; set; } = true;
        public bool OverwriteExisting { get; set; } = false;
        public BoxartBorderStyle BoxartBorderStyle { get; set; }
        public int BoxartBorderThickness { get; set; }
        public uint BoxartBorderColor { get; set; }
        public bool DisableUpdates { get; set; } = false;

        public const string MagicDir = "_nds";
        public const string FileName = "TwilightBoxart.ini";
        public const string Repository = "KirovAir/TwilightBoxart";

        public static Version Version = new Version(0, 7, 0);
        public static string Credits = "TwilightBoxart - Created by KirovAir." + Environment.NewLine + "Loads of love to the devs of TwilightMenu++, LibRetro, GameTDB and the maintainers of the No-Intro DB.";

        public static string RepositoryUrl = $"https://github.com/{Repository}";
        public static string RepositoryReleasesUrl = $"https://github.com/{Repository}/releases";
        
        public static string NoIntroDbUrl = $"https://github.com/{Repository}/raw/eae55d6108160070559f9ef784d1bc9785197825/TwilightBoxart/NoIntro.db";
        public static string DsiWareBoxartUrl = $"https://github.com/{Repository}/raw/eae55d6108160070559f9ef784d1bc9785197825/img/dsiware.jpg";

        public void Load()
        {
            Load(FileName);
        }

        public string GetCorrectBoxartPath(string root = "")
        {
            return GetBoxartPath(root);
        }

        public string GetBoxartPath(string root = "")
        {
             return GetCorrectPath(BoxartPath, root);
        }

        public string GetCorrectSettingsIniPath(string root = "")
        {
            return GetCorrectPath(SettingsPath, root);
        }

        public string GetCorrectPath(string pathMask, string root = "")
        {
            if (root == "")
            {
                root = SdRoot;
            }

            if (!pathMask.StartsWith("{sdroot}"))
            {
                return pathMask;
            }

            if (root.Contains(Path.DirectorySeparatorChar.ToString()))
            {
                try
                {
                    var split = root.Split(Path.DirectorySeparatorChar);
                    var tmpReplace = "";
                    for (var i = split.Length; i-- > 0;)
                    {
                        tmpReplace = split[i] + Path.DirectorySeparatorChar + tmpReplace;
                        tmpReplace = tmpReplace.TrimEnd(Path.DirectorySeparatorChar);

                        var place = root.LastIndexOf(tmpReplace);
                        if (place == -1)
                            break;
                        var correctRoot = root.Remove(place, tmpReplace.Length);

                        if (Directory.Exists(Path.Combine(correctRoot, MagicDir)))
                        {
                            root = correctRoot;
                            break;
                        }
                    }
                }
                catch { }
            }

            return Path.Combine(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, pathMask.Replace("{sdroot}", "").TrimStart(Path.DirectorySeparatorChar));
        }

        public static readonly Dictionary<string, ConsoleType> ExtensionMapping = new Dictionary<string, ConsoleType>
        {
            {".nes", ConsoleType.NintendoEntertainmentSystem},
            {".sfc", ConsoleType.SuperNintendoEntertainmentSystem},
            {".smc", ConsoleType.SuperNintendoEntertainmentSystem},
            {".snes", ConsoleType.SuperNintendoEntertainmentSystem},
            {".gb", ConsoleType.GameBoy},
            {".sgb", ConsoleType.GameBoy},
            {".gbc", ConsoleType.GameBoyColor},
            {".gba", ConsoleType.GameBoyAdvance},
            {".nds", ConsoleType.NintendoDS},
            {".ds", ConsoleType.NintendoDS},
            {".dsi", ConsoleType.NintendoDSi},
            {".gg", ConsoleType.SegaGameGear},
            {".gen", ConsoleType.SegaGenesis},
            {".sms", ConsoleType.SegaMasterSystem},
            {".fds", ConsoleType.FamicomDiskSystem},
            {".zip", ConsoleType.Unknown }
        };
        
        public static readonly List<string> SupportedFiles = new List<string>
        {
            ".nes",
            ".sfc",
            ".smc",
            ".snes",
            ".gb",
            ".sgb",
            ".gbc",
            ".gba",
            ".nds",
            ".ds",
            ".dsi",
            ".gg",
            ".gen",
            ".sms",
            ".fds",
            ".zip"
        };
    }
}